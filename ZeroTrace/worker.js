'use strict';
importScripts('vendor-loader.js', 'pdf-core.js');
const digest = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
self.onmessage = async ({ data }) => {
  const { id, operation } = data;
  try {
    if (operation === 'zip') {
      const zip = new JSZip();
      for (const file of data.files) zip.file(file.name, file.bytes);
      const bytes = await zip.generateAsync({ type:'uint8array', compression:'STORE' }, ({ percent }) => self.postMessage({id, progress:percent}));
      self.postMessage({ id, result:{ bytes } }, [bytes.buffer]);
      return;
    }
    const bytes = operation === 'sample' ? await ZeroTraceCore.generateSampleDirtyPdf() : new Uint8Array(data.bytes);
    const inputSha256 = await digest(bytes);
    self.postMessage({ id, progress:15 });
    const result = await ZeroTraceCore.stripPdfMetadata(bytes);
    const outputSha256 = await digest(result.cleanedBytes);
    result.audit = ZeroTraceCore.buildAudit(result, { originalSha256:inputSha256, outputSha256, originalBytes:bytes.byteLength, originalName:data.originalName || null, outputName:data.outputName || null });
    result.inputSize = bytes.byteLength;
    self.postMessage({ id, result }, [result.cleanedBytes.buffer]);
  } catch (error) { self.postMessage({ id, error:error.message || 'Unable to process this PDF.', code:error.code || 'PROCESSING_FAILED' }); }
};
self.postMessage({ ready:true });
