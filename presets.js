// Cassian website previews. Original project provenance: Crazaloth.
import {SIGNATURE_PRESETS} from './preset-data.js';

export function formatSetting(value) {
  return typeof value === 'boolean' ? value ? 'On' : 'Off' : String(value);
}

export function dialPosition(value, minimum, maximum) {
  if (![value, minimum, maximum].every(Number.isFinite) || maximum <= minimum) return 0;
  return Math.round(Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum))) * 20);
}

export function viperPreview(settings) {
  return {
    controls: {Drive: settings.Gain ?? 8, Bass: settings.Bass ?? 5, Mid: settings.Mid ?? 7,
      'Treb.': settings.Treb ?? 6, 'Pres.': settings.Pres ?? 5, Tight: 70, Space: 12, Master: -12},
    channel: settings.Channel ?? 3,
    switches: {Boost: settings.Boost === true, Gate: true, Deep: settings.Deep === true}
  };
}

export function initializePreviews(document) {
  const hero = document.querySelector('.viper-render');
  const heroStatus = document.getElementById('hero-control-status');
  const status = document.getElementById('preset-status');
  const trays = [...document.querySelectorAll('.signature-tray')];

  function updateDial(label, value) {
    const input = label.querySelector('input');
    const number = Number(value);
    input.value = String(number);
    label.dataset.position = String(dialPosition(number, Number(input.min), Number(input.max)));
    const suffix = label.dataset.control === 'Tight' ? ' Hz'
      : label.dataset.control === 'Space' ? '%' : label.dataset.control === 'Master' ? ' dB' : '';
    label.querySelector('output').textContent = `${number}${suffix}`;
  }

  function setChannel(channel) {
    for (const button of hero.querySelectorAll('[data-channel]')) {
      const selected = Number(button.dataset.channel) === channel;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('selected', selected);
    }
  }

  function setSwitch(button, enabled) {
    button.setAttribute('aria-pressed', String(enabled));
    button.querySelector('.mini-toggle').classList.toggle('toggle-up', enabled);
  }

  function showViper(preset) {
    const preview = viperPreview(preset.settings);
    for (const label of hero.querySelectorAll('.viper-knob')) {
      updateDial(label, preview.controls[label.dataset.control]);
    }
    setChannel(preview.channel);
    for (const button of hero.querySelectorAll('[data-switch]')) {
      setSwitch(button, preview.switches[button.dataset.switch]);
    }
    heroStatus.textContent = `Viper preview · ${preset.name}. Settings stay on this page.`;
  }

  function activate(tray, index, focus = false) {
    const presets = SIGNATURE_PRESETS[tray.dataset.amp];
    const preset = presets?.[index];
    if (!preset) return;
    const buttons = [...tray.querySelectorAll('[role="tab"]')];
    for (const [number, button] of buttons.entries()) {
      button.setAttribute('aria-selected', String(number === index));
      button.tabIndex = number === index ? 0 : -1;
    }
    const panel = tray.querySelector('[role="tabpanel"]');
    panel.setAttribute('aria-labelledby', buttons[index].id);
    const cells = Object.entries(preset.settings).map(([name, value]) => {
      const cell = document.createElement('div');
      const label = document.createElement('dt');
      const setting = document.createElement('dd');
      label.textContent = name;
      setting.textContent = formatSetting(value);
      cell.append(label, setting);
      return cell;
    });
    panel.querySelector('dl').replaceChildren(...cells);
    for (const candidate of trays) candidate.closest('.amp-card').classList.toggle('preset-selected', candidate === tray);
    const name = tray.closest('.amp-card').querySelector('h3').textContent;
    status.textContent = `${name} · ${preset.name}. Suggested settings; adjust by ear in Cassian.`;
    if (tray.dataset.amp === 'viper' && hero) showViper(preset);
    if (focus) buttons[index].focus();
  }

  for (const tray of trays) {
    const buttons = [...tray.querySelectorAll('[role="tab"]')];
    for (const [index, button] of buttons.entries()) {
      button.addEventListener('click', () => activate(tray, index));
      button.addEventListener('keydown', event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % buttons.length
          : event.key === 'ArrowLeft' ? (index - 1 + buttons.length) % buttons.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        activate(tray, next, true);
      });
    }
  }

  if (!hero) return;
  for (const label of hero.querySelectorAll('.viper-knob')) {
    label.querySelector('input').addEventListener('input', event => {
      updateDial(label, event.target.valueAsNumber);
      heroStatus.textContent = `Viper custom preview · ${label.dataset.control} ${label.querySelector('output').textContent}.`;
    });
  }
  for (const button of hero.querySelectorAll('[data-channel]')) {
    button.addEventListener('click', () => {
      setChannel(Number(button.dataset.channel));
      heroStatus.textContent = `Viper custom preview · ${button.textContent.trim()} channel.`;
    });
  }
  for (const button of hero.querySelectorAll('[data-switch]')) {
    button.addEventListener('click', () => {
      const enabled = button.getAttribute('aria-pressed') !== 'true';
      setSwitch(button, enabled);
      heroStatus.textContent = `Viper custom preview · ${button.dataset.switch} ${enabled ? 'on' : 'off'}.`;
    });
  }
}

if (typeof document !== 'undefined') initializePreviews(document);
