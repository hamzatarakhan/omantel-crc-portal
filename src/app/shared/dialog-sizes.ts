/**
 * Dialog widths are relative to the screen, so they grow on wide displays and shrink to 94% on phones.
 * (Material's own default caps a dialog at 80vw / 560px, which clipped our content — see .app-dialog-panel.)
 */
const size = (px: number) => ({ width: `min(${px}px, 94vw)`, maxWidth: '94vw' });

export const DIALOG_SIZE = {
  confirm: size(520),
  form: size(720),
  wide: size(1120),
};
