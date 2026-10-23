import { PLAYER_PORTRAITS, playerPortrait, portraitAsset } from '../shared/portraits.ts';
import { artworkUrl } from './artwork.ts';

interface ProfileState {
  /** Latest authoritative private player projection. */
  you: { name: string; portraitId: string } | null;
}
/** Personal profile chooser uses a native modal, with server-confirmed saves only. */
export function initProfile(state: ProfileState, send: (message: object) => void) {
  const dialog = document.getElementById('profiledialog') as HTMLDialogElement;
  const choices = document.getElementById('portraitchoices')!;
  const preview = document.getElementById('portraitpreview') as HTMLImageElement;
  const status = document.getElementById('portraitstatus')!;
  const save = document.getElementById('portraitsave') as HTMLButtonElement;
  let selected = '',
    pending = false,
    previousFocus: HTMLElement | null = null;
  const showPreview = () => {
    preview.src = artworkUrl(portraitAsset(selected));
  };
  for (const portrait of PLAYER_PORTRAITS) {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'portrait';
    radio.value = portrait.id;
    const image = document.createElement('img');
    image.src = artworkUrl(portraitAsset(portrait.id));
    image.alt = '';
    image.width = image.height = 80;
    image.loading = 'lazy';
    radio.onchange = () => {
      selected = portrait.id;
      showPreview();
      status.textContent = 'Preview — not saved.';
    };
    label.append(radio, image, document.createTextNode(portrait.label));
    choices.append(label);
  }
  function open() {
    if (!state.you || dialog.open) return;
    previousFocus = document.activeElement as HTMLElement | null;
    selected = playerPortrait(state.you.portraitId);
    showPreview();
    document.getElementById('profilename')!.textContent = state.you.name;
    for (const radio of choices.querySelectorAll<HTMLInputElement>('input'))
      radio.checked = radio.value === selected;
    status.textContent = 'Choose a portrait for your public profile and player hails.';
    dialog.showModal();
    choices.querySelector<HTMLInputElement>('input:checked')?.focus();
  }
  for (const id of ['profilebtn', 'landprofilebtn']) document.getElementById(id)!.onclick = open;
  document.getElementById('portraitclose')!.onclick = () => dialog.close();
  dialog.addEventListener('close', () => previousFocus?.focus());
  dialog.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      dialog.close();
    }
  });
  save.onclick = () => {
    if (!state.you || pending) return;
    pending = true;
    save.disabled = true;
    status.textContent = 'Saving…';
    send({ t: 'portrait', portraitId: selected });
  };
  return {
    reset() {
      pending = false;
      save.disabled = false;
      dialog.close();
      preview.removeAttribute('src');
      status.textContent = '';
    },
    onMessage(message: { t?: string; ok?: boolean; portraitId?: unknown }) {
      if (message.t !== 'portrait') return false;
      pending = false;
      save.disabled = false;
      status.textContent = message.ok
        ? message.portraitId === selected
          ? 'Saved.'
          : 'Previous selection saved. Current preview is not saved.'
        : 'Portrait was not saved. Choose an available portrait.';
      return true;
    },
  };
}
