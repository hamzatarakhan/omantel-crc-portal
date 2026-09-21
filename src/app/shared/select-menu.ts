/**
 * Replaces the browser's own <select> option list (grey, old-looking, not stylable) with a white panel that matches
 * the account menu. It works on the existing <select> elements, so ngModel, [value]/(change) and forms keep working:
 * picking an option sets the select's value and fires the usual `input` and `change` events.
 */
let panel: HTMLDivElement | null = null;
let owner: HTMLSelectElement | null = null;
let active = -1;

const CHECK = '<svg class="app-select-check" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5 8.5 14.5 15.5 6"/></svg>';

function items(): HTMLButtonElement[] {
  return panel ? Array.from(panel.querySelectorAll<HTMLButtonElement>('.app-select-item:not(:disabled)')) : [];
}

function highlight(i: number) {
  const list = items();
  if (!list.length) return;
  active = (i + list.length) % list.length;
  list.forEach((b, n) => b.classList.toggle('is-active', n === active));
  list[active].scrollIntoView({ block: 'nearest' });
}

function close(refocus = false) {
  panel?.remove();
  panel = null;
  const sel = owner;
  owner = null;
  active = -1;
  if (sel && refocus) sel.focus();
}

function choose(sel: HTMLSelectElement, value: string) {
  if (sel.value !== value) {
    sel.value = value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  close(true);
}

function open(sel: HTMLSelectElement) {
  close();
  owner = sel;
  const p = (panel = document.createElement('div'));
  p.className = 'app-select-panel';
  p.setAttribute('role', 'listbox');
  for (const o of Array.from(sel.options)) {
    if (o.disabled && o.value === '') continue; // the "Select…" placeholder is not a choice
    const b = document.createElement('button');
    b.type = 'button';
    b.disabled = o.disabled;
    b.setAttribute('role', 'option');
    b.className = 'app-select-item' + (o.value === sel.value ? ' is-selected' : '');
    b.innerHTML = '<span class="app-select-label"></span>' + CHECK;
    b.querySelector('.app-select-label')!.textContent = (o.textContent ?? '').trim();
    b.addEventListener('click', () => choose(sel, o.value));
    p.appendChild(b);
  }
  document.body.appendChild(p);

  const r = sel.getBoundingClientRect();
  p.style.minWidth = `${Math.max(r.width, 140)}px`;
  p.style.maxHeight = `${Math.min(320, window.innerHeight - 24)}px`;
  const h = p.offsetHeight;
  const w = p.offsetWidth;
  const below = window.innerHeight - r.bottom - 12;
  p.style.top = `${below >= h || below >= r.top ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
  p.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;

  const selected = items().findIndex((b) => b.classList.contains('is-selected'));
  highlight(selected >= 0 ? selected : 0);
}

export function enableCustomSelects() {
  // Phones and tablets have their own good picker; opening ours as well stacks two lists on iOS, so leave <select> native there.
  if (window.matchMedia('(pointer: coarse)').matches) return;
  const selectOf = (e: Event) => (e.target as HTMLElement | null)?.closest?.('select') as HTMLSelectElement | null;
  const toggle = (sel: HTMLSelectElement) => {
    sel.focus();
    if (owner === sel) close();
    else open(sel);
  };
  // Capture phase so we run before the browser (and before Material's dialog focus handling) sees the click.
  document.addEventListener('mousedown', (e) => {
    const sel = selectOf(e);
    const t = e.target as HTMLElement | null;
    if (sel && !sel.disabled) {
      e.preventDefault();
      toggle(sel);
    } else if (panel && !panel.contains(t)) {
      close();
    }
  }, true);

  // Last line of defence: whatever the browser, a click on a <select> never reaches its native list.
  document.addEventListener('click', (e) => { if (selectOf(e)) e.preventDefault(); }, true);

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (panel) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); highlight(0); }
      else if (e.key === 'End') { e.preventDefault(); highlight(items().length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); items()[active]?.click(); }
      else if (e.key === 'Tab') close();
      return;
    }
    if (t instanceof HTMLSelectElement && !t.disabled && (e.key === 'Enter' || e.key === ' ' || (e.key === 'ArrowDown' && e.altKey))) {
      e.preventDefault();
      open(t);
    }
  }, true);

  const away = (e: Event) => { if (panel && !panel.contains(e.target as Node)) close(); };
  // A phone's address bar sliding in and out only changes the height; that must not close the list.
  let width = window.innerWidth;
  window.addEventListener('resize', () => { if (window.innerWidth !== width) { width = window.innerWidth; close(); } });
  window.addEventListener('scroll', away, true);
}
