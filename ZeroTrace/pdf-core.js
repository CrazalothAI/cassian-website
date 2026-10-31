/* ZeroTrace PDF metadata engine. Derived from the Min10 Studios prototype.
 * pdf-lib is provided locally by the host; this file runs in Node or a Worker.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('pdf-lib'));
  else root.ZeroTraceCore = factory(root.PDFLib);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (PDFLib) {
  'use strict';
  if (!PDFLib) throw new Error('The local PDF library could not be loaded.');
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFString, PDFHexString,
    PDFRawStream, PDFStream, PDFInvalidObject, StandardFonts, rgb, decodePDFRawStream } = PDFLib;
  const VERSION = '2.0.0';
  const TARGET_KEYS = ['Metadata', 'PieceInfo', 'SpiderInfo'];
  const MAX_INPUT_BYTES = 50 * 1024 * 1024;
  const MAX_NODES = 300000;
  const MAX_FIELDS = 10000;
  const MAX_PREVIEW_BYTES = 16384;
  const MAX_ENCODED_PREVIEW_BYTES = 262144;
  const MAX_PREVIEW_PACKETS = 32;
  const MAX_TOTAL_PREVIEW_CHARACTERS = 65536;
  const WARNINGS = [
    'This check covers PDF document Info, Metadata streams, PieceInfo, SpiderInfo, and trailer ID only. It is not proof of anonymity or content redaction.',
    'Visible text, images, OCR, comments, forms, attachments, embedded files, links, scripts, and other custom content can still identify you. Review the output before sharing.',
    'The saved output is reloaded using the same PDF library. This is a fresh parse, not validation by an independent implementation.'
  ];
  const N = (key) => PDFName.of(key);
  function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
  function resolve(doc, object) {
    if (object instanceof PDFRef) {
      const result = doc.context.lookup(object);
      if (!result) fail('INVALID_REFERENCE', 'The PDF contains an unresolved object reference. No cleaned copy was produced.');
      return result;
    }
    return object;
  }
  function isStream(object) { return object instanceof PDFRawStream || (PDFStream && object instanceof PDFStream); }
  function children(object) {
    if (isStream(object)) return [["stream dictionary", object.dict]];
    if (object instanceof PDFDict) return object.entries().map(([key, value]) => [key.decodeText(), value]);
    if (object instanceof PDFArray) return object.asArray().map((value, index) => [String(index), value]);
    return [];
  }
  // Iterative traversal tolerates cycles without recursive stack exhaustion.
  function walk(doc, roots, visit) {
    const seen = new Set();
    const refs = new Set();
    const stack = roots.map(([location, object]) => ({location, object}));
    let count = 0;
    while (stack.length) {
      const entry = stack.pop();
      if (++count > MAX_NODES) fail('COMPLEXITY_LIMIT', 'This PDF is too structurally complex for this browser tool. Use an offline PDF workflow.');
      if (entry.object instanceof PDFRef) refs.add(entry.object.toString());
      const object = resolve(doc, entry.object);
      if (!object || seen.has(object)) continue;
      if (PDFInvalidObject && object instanceof PDFInvalidObject) fail('INVALID_OBJECT', 'The PDF contains a malformed object. No cleaned copy was produced.');
      seen.add(object);
      visit(object, entry.location);
      for (const [key, value] of children(object)) {
        stack.push({location: (entry.location + '/' + key).slice(0, 500), object: value});
      }
    }
    return {seen, refs};
  }
  function liveRoots(doc) {
    return Object.entries(doc.context.trailerInfo).filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => ['/Trailer/' + key, value]);
  }
  function allRoots(doc) {
    return [...doc.context.enumerateIndirectObjects().map(([ref, object]) => ['/Object/' + ref.toString(), object]), ...liveRoots(doc)];
  }
  function locations(doc) {
    const map = new Map([[doc.catalog, '/Catalog']]);
    doc.getPages().forEach((page, index) => map.set(page.node, '/Page/' + (index + 1)));
    return map;
  }
  function valueText(doc, value) {
    const object = resolve(doc, value);
    if (object === undefined || object === null) return '(missing)';
    if (object instanceof PDFString || object instanceof PDFHexString) {
      try { return object.decodeText().slice(0, 2048) || '(empty string)'; }
      catch { return '(undecodable PDF string)'; }
    }
    if (isStream(object)) return 'Embedded stream';
    if (object instanceof PDFDict) return 'Dictionary (' + object.keys().length + ' entries)';
    if (object instanceof PDFArray) return 'Array (' + object.size() + ' entries)';
    return String(object).slice(0, 2048);
  }
  function riskFor(key) {
    if (/author|creator|company|manager|workstation|gps|location|user|email|aapl|ptex/i.test(key)) return 'high';
    if (/date|time|modified|producer|metadata/i.test(key)) return 'medium';
    if (/^(title|subject|keywords|trapped)$/i.test(key)) return 'low';
    return 'high';
  }
  function preview(doc, raw, location) {
    const stream = resolve(doc, raw);
    if (!isStream(stream)) return {location, text: 'Metadata entry is not a stream.', truncated: false, decoded: false};
    const encoded = stream.getContents();
    if (encoded.length > MAX_ENCODED_PREVIEW_BYTES) return {location, text: 'Preview omitted: encoded stream exceeds 256 KiB. The metadata entry will still be removed.', truncated: true, decoded: false};
    try {
      let bytes;
      if (stream instanceof PDFRawStream && stream.dict.has(N('Filter'))) {
        // Decode one Flate layer only. Chained decoders can expand intermediate
        // streams before the outer preview limit applies, so omit those previews.
        if (String(stream.dict.lookup(N('Filter'))) !== '/FlateDecode') {
          return {location, text: 'Preview omitted for this filter chain. The metadata entry will still be removed.', truncated: false, decoded: false};
        }
        const decoded = decodePDFRawStream(stream);
        const allocate = decoded.ensureBuffer.bind(decoded);
        decoded.ensureBuffer = (requested) => {
          if (requested > 65536) throw new Error('XMP_PREVIEW_LIMIT');
          return allocate(requested);
        };
        bytes = decoded.getBytes(MAX_PREVIEW_BYTES + 1);
      } else bytes = encoded;
      const truncated = bytes.length > MAX_PREVIEW_BYTES;
      return {location, text: new TextDecoder('utf-8', {fatal: false}).decode(bytes.subarray(0, MAX_PREVIEW_BYTES)), truncated, decoded: true};
    } catch (error) {
      if (error.message === 'XMP_PREVIEW_LIMIT') return {location, text: 'Preview omitted: decoded stream exceeds the preview memory limit. The metadata entry will still be removed.', truncated: true, decoded: false};
      return {location, text: 'Preview unavailable for this stream encoding. The metadata entry will still be removed.', truncated: false, decoded: false};
    }
  }
  function assertNoSignatures(doc) {
    walk(doc, allRoots(doc), (object) => {
      if (!(object instanceof PDFDict)) return;
      const type = resolve(doc, object.get(N('Type')));
      const ft = resolve(doc, object.get(N('FT')));
      if (String(type) === '/Sig' || String(ft) === '/Sig' || object.has(N('ByteRange')) || object.has(N('DocMDP'))) {
        fail('SIGNED_PDF', 'This PDF contains a signature or signature field. Rewriting it can invalidate signatures, so no cleaned copy was produced.');
      }
    });
  }
  function inspectPdfMetadata(doc) {
    const fields = [];
    const xmpPreviews = [];
    let previewCharacters = 0;
    let previewPackets = 0;
    const previewCache = new Map();
    const knownLocations = locations(doc);
    const metadataStreams = new Set();
    const addPreview = (value, location) => {
      previewPackets++;
      if (xmpPreviews.length >= MAX_PREVIEW_PACKETS || previewCharacters >= MAX_TOTAL_PREVIEW_CHARACTERS) return;
      const target = resolve(doc, value);
      if (!previewCache.has(target)) previewCache.set(target, preview(doc, value, location));
      const entry = {...previewCache.get(target), location};
      const available = MAX_TOTAL_PREVIEW_CHARACTERS - previewCharacters;
      if (entry.text.length > available) { entry.text = entry.text.slice(0, available); entry.truncated = true; }
      previewCharacters += entry.text.length;
      xmpPreviews.push(entry);
    };
    const add = (key, value, category, risk, location) => {
      if (fields.length >= MAX_FIELDS) fail('FIELD_LIMIT', 'This PDF has too many metadata entries to audit safely in this browser.');
      fields.push({key, value, category, risk, location});
    };
    const info = doc.context.trailerInfo.Info;
    if (info !== undefined) {
      const dict = resolve(doc, info);
      if (dict instanceof PDFDict) {
        if (!dict.keys().length) add('/Info', 'Empty document information dictionary', 'Document Info', 'low', '/Trailer/Info');
        for (const [key, value] of dict.entries()) {
          const name = key.decodeText();
          add('/' + name, valueText(doc, value), 'Document Info', riskFor(name), '/Trailer/Info');
        }
      } else add('/Info', valueText(doc, info), 'Document Info', 'high', '/Trailer');
    }
    if (doc.context.trailerInfo.ID !== undefined) add('/ID', valueText(doc, doc.context.trailerInfo.ID), 'Document identifier', 'high', '/Trailer');
    walk(doc, allRoots(doc), (object, path) => {
      if (!(object instanceof PDFDict)) return;
      const location = knownLocations.get(object) || path;
      for (const key of TARGET_KEYS) {
        if (!object.has(N(key))) continue;
        const value = object.get(N(key));
        const target = resolve(doc, value);
        add('/' + key, valueText(doc, value), key === 'Metadata' ? 'XMP stream' : 'Application-private data', key === 'Metadata' ? 'medium' : 'high', location);
        if (key === 'Metadata') {
          metadataStreams.add(target);
          addPreview(value, location + '/Metadata');
        }
      }
    });
    // Also surface unattached streams so old/orphan XMP is not silently ignored.
    for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
      if (isStream(object) && String(resolve(doc, object.dict.get(N('Type')))) === '/Metadata' && !metadataStreams.has(object)) {
        const location = '/Object/' + ref.toString();
        add('/Metadata', 'Unattached or independently referenced metadata stream', 'XMP stream', 'medium', location);
        addPreview(object, location);
      }
    }
    const score = Math.min(100, fields.reduce((sum, field) => sum + ({high: 20, medium: 10, low: 3}[field.risk]), 0));
    const omittedPreviews = previewPackets - xmpPreviews.length;
    const warnings = WARNINGS.slice();
    if (omittedPreviews) warnings.push(omittedPreviews + ' XMP previews were omitted to keep the report bounded. All detected metadata entries are still counted and removed.');
    return {fields, pageCount: doc.getPageCount(), xmpPreviews,
      previewSummary: {totalPackets: previewPackets, displayedPackets: xmpPreviews.length, omittedPackets: omittedPreviews}, riskScore: score,
      riskLevel: score >= 60 ? 'High exposure' : score >= 20 ? 'Moderate exposure' : score ? 'Low exposure' : 'No scoped metadata detected',
      warnings};
  }
  async function loadStrict(bytes) {
    let doc;
    try {
      doc = await PDFDocument.load(bytes, {updateMetadata: false, ignoreEncryption: false, throwOnInvalidObject: true});
    } catch (error) {
      if (/encrypt/i.test(error.message)) fail('ENCRYPTED_PDF', 'Password-protected or encrypted PDFs are not supported. Unlock a copy with a trusted offline tool first.');
      fail('INVALID_PDF', 'The PDF could not be parsed safely. It may be damaged or unsupported. No cleaned copy was produced.');
    }
    if (doc.isEncrypted || doc.context.trailerInfo.Encrypt) fail('ENCRYPTED_PDF', 'Encrypted PDFs are not supported. No cleaned copy was produced.');
    // Validate all object references, including objects not in the page tree.
    walk(doc, allRoots(doc), () => {});
    if (!doc.getPageCount()) fail('EMPTY_PDF', 'The PDF has no pages. No cleaned copy was produced.');
    return doc;
  }
  async function stripPdfMetadata(input) {
    let bytes;
    try { bytes = input instanceof Uint8Array ? input : new Uint8Array(input); }
    catch { fail('INVALID_INPUT', 'Choose a PDF file to continue.'); }
    if (!bytes.byteLength || bytes.byteLength > MAX_INPUT_BYTES) fail('FILE_SIZE', 'Choose a PDF up to 50 MiB. Larger files need an offline workflow.');
    const header = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
    const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 4096)));
    if (!/^%PDF-\d\.\d/.test(header) || !/%%EOF\s*$/.test(tail)) fail('INVALID_PDF', 'This file is not a complete supported PDF. No cleaned copy was produced.');
    const doc = await loadStrict(bytes);
    assertNoSignatures(doc);
    const beforeReport = inspectPdfMetadata(doc);
    const removedRoots = [];
    for (const key of ['Info', 'ID']) {
      if (doc.context.trailerInfo[key] !== undefined) removedRoots.push(['/Trailer/' + key, doc.context.trailerInfo[key]]);
      delete doc.context.trailerInfo[key];
    }
    walk(doc, allRoots(doc), (object, location) => {
      if (!(object instanceof PDFDict)) return;
      for (const key of TARGET_KEYS) {
        if (!object.has(N(key))) continue;
        removedRoots.push([location + '/' + key, object.get(N(key))]);
        object.delete(N(key));
      }
    });
    const live = walk(doc, liveRoots(doc), () => {});
    // Shared metadata/content graphs require an explicit offline decision. Do not
    // delete a referenced font, attachment, or content object to force a zero count.
    if (removedRoots.length) {
      const removed = walk(doc, removedRoots, () => {});
      for (const ref of removed.refs) if (live.refs.has(ref)) {
        fail('SHARED_METADATA', 'Metadata shares objects with retained PDF content. Safe automatic removal is not possible for this file; use an offline PDF editor.');
      }
      for (const object of removed.seen) {
        if ((object instanceof PDFDict || object instanceof PDFArray || isStream(object)) && live.seen.has(object)) {
          fail('SHARED_METADATA', 'Metadata shares structures with retained PDF content. No cleaned copy was produced.');
        }
      }
    }
    for (const [ref] of doc.context.enumerateIndirectObjects()) {
      if (!live.refs.has(ref.toString())) doc.context.delete(ref);
    }
    const pageCount = doc.getPageCount();
    const cleanedBytes = await doc.save({useObjectStreams: true, updateFieldAppearances: false, addDefaultPage: false});
    const reloaded = await loadStrict(cleanedBytes);
    const afterReport = inspectPdfMetadata(reloaded);
    if (afterReport.fields.length || afterReport.pageCount !== pageCount) {
      fail('VERIFICATION_FAILED', 'The rewritten PDF did not pass the metadata check. No cleaned copy was released.');
    }
    return {cleanedBytes, beforeReport, afterReport, verification: {passed: true,
      method: 'Fresh parse of output bytes using pdf-lib ' + '1.17.1',
      scope: ['Trailer Info (all keys)', 'Metadata entries and streams', 'PieceInfo', 'SpiderInfo', 'Trailer ID'],
      remainingScopedFields: 0}, warnings: WARNINGS.slice()};
  }
  async function generateSampleDirtyPdf() {
    const doc = await PDFDocument.create({updateMetadata: false});
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([612, 792]);
    page.drawRectangle({x: 0, y: 680, width: 612, height: 112, color: rgb(0.06, 0.10, 0.13)});
    page.drawText('ZEROTRACE / SAMPLE DOCUMENT', {x: 48, y: 738, size: 22, font: bold, color: rgb(0.73, 0.93, 0.59)});
    const lines = [
      'This is a fictional PDF generated entirely in your browser.',
      'Its hidden properties include standard and custom document fields,',
      'compressed catalog XMP, page XMP, and application-private data.',
      '',
      'The page content below should remain after metadata removal.',
      'Visible text is NOT redacted by this tool.',
      '',
      'Example visible author: Alex Example',
      'Example visible project: Sample Project',
      '',
      'Check the before/after inspector and download the audit report.',
      'The report covers named metadata structures, not anonymity.'
    ];
    lines.forEach((line, index) => page.drawText(line, {x: 48, y: 635 - index * 26, size: 12, font, color: rgb(0.14, 0.20, 0.25)}));
    const info = doc.context.obj({});
    const values = {Title: 'Sample Project draft', Author: 'Alex Example <alex@example.invalid>', Subject: 'Metadata removal demonstration', Keywords: 'sample, privacy, internal', Creator: 'Example Writer 4.2', Producer: 'Example OS Build 1234', CreationDate: "D:20261014094218Z", ModDate: "D:20261027115804Z", Company: 'Example Company', Manager: 'Morgan Example', InternalWorkstationID: 'SAMPLE-LAPTOP-07', SourceModified: "D:20261027115730-04'00'", 'AAPL:Keywords': 'Example vendor tag', 'PTEX.Fullbanner': 'Example TeX toolchain', CustomEmptyField: ''};
    for (const [key, value] of Object.entries(values)) info.set(N(key), PDFString.of(value));
    doc.context.trailerInfo.Info = doc.context.register(info);
    const xml = '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="Alex Example" dc:description="Sample hidden XMP marker" /></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
    doc.catalog.set(N('Metadata'), doc.context.register(doc.context.flateStream(xml, {Type: 'Metadata', Subtype: 'XML'})));
    page.node.set(N('Metadata'), doc.context.register(doc.context.stream(xml.replace('Sample hidden', 'Page hidden'), {Type: 'Metadata', Subtype: 'XML'})));
    doc.catalog.set(N('PieceInfo'), doc.context.register(doc.context.obj({ExampleEditor: {Private: PDFString.of('Sample application private data')}})));
    page.node.set(N('PieceInfo'), doc.context.obj({ExampleEditor: {Private: PDFString.of('Sample page private data')}}));
    doc.catalog.set(N('SpiderInfo'), doc.context.obj({Source: PDFString.of('https://example.invalid/private-document')}));
    page.node.set(N('SpiderInfo'), doc.context.obj({Source: PDFString.of('https://example.invalid/private-page')}));
    doc.context.trailerInfo.ID = doc.context.obj([PDFHexString.of('00112233445566778899aabbccddeeff'), PDFHexString.of('ffeeddccbbaa99887766554433221100')]);
    return doc.save({useObjectStreams: false, updateFieldAppearances: false});
  }
  function buildAudit(result, details) {
    const opts = details || {};
    const fields = result.beforeReport.fields.map(({key, value, category, risk, location}) =>
      opts.includeValues ? {key, value, category, risk, location} : {key, category, risk, location});
    return {format: 'ZeroTrace scoped metadata audit', version: VERSION, generatedAt: new Date().toISOString(),
      originalName: opts.originalName || null, outputName: opts.outputName || null,
      originalSha256: opts.originalSha256 || null, outputSha256: opts.outputSha256 || null,
      originalBytes: opts.originalBytes || null, outputBytes: result.cleanedBytes.byteLength,
      pageCount: result.afterReport.pageCount, fieldsBefore: fields, fieldsAfter: result.afterReport.fields,
      riskScoreBefore: result.beforeReport.riskScore, riskScoreAfter: result.afterReport.riskScore,
      verification: result.verification, warnings: result.warnings,
      reportNotice: 'Self-generated local audit, not a signed certificate or proof of redaction. Field values are omitted unless explicitly requested. Filenames and hashes can identify a document; handle this audit carefully.'};
  }
  return Object.freeze({VERSION, MAX_INPUT_BYTES, inspectPdfMetadata, stripPdfMetadata, generateSampleDirtyPdf, buildAudit});
});
