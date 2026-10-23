'use client';

// In-page replacements for window.confirm/prompt: a styled modal <dialog> (focus trap, Esc to cancel,
// screen-reader labelled) built with textContent so messages are never parsed as HTML.
type Options = { ok?: string; cancel?: string; danger?: boolean };

function open<T>(
  message: string,
  { ok = '확인', cancel = '취소', danger = false }: Options,
  field: { maxLength?: number; placeholder?: string } | null,
  result: (accepted: boolean, value: string) => T,
): Promise<T> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'post-dialog confirm-dialog';
    const inner = document.createElement('form');
    inner.method = 'dialog';
    inner.className = 'dialog-inner';
    const text = document.createElement('p');
    text.id = `confirm-${Math.random().toString(36).slice(2)}`;
    text.textContent = message;
    dialog.setAttribute('aria-labelledby', text.id);
    inner.appendChild(text);
    let entry: HTMLInputElement | null = null;
    if (field) {
      entry = document.createElement('input');
      entry.setAttribute('aria-labelledby', text.id);
      if (field.maxLength) entry.maxLength = field.maxLength;
      if (field.placeholder) entry.placeholder = field.placeholder;
      inner.appendChild(entry);
    }
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'secondary';
    no.textContent = cancel;
    const yes = document.createElement('button');
    yes.type = 'submit';
    yes.value = 'ok';
    yes.className = danger ? 'primary danger' : 'primary';
    yes.textContent = ok;
    actions.appendChild(no);
    actions.appendChild(yes);
    inner.appendChild(actions);
    dialog.appendChild(inner);
    no.onclick = () => dialog.close('');
    dialog.onclick = (e) => {
      if (e.target === dialog) dialog.close('');
    };
    dialog.onclose = () => {
      const accepted = dialog.returnValue === 'ok';
      dialog.remove();
      resolve(result(accepted, entry?.value.trim() ?? ''));
    };
    document.body.appendChild(dialog);
    dialog.showModal();
    (entry ?? (danger ? no : yes)).focus();
  });
}

/** Resolves true when the user confirms. Destructive actions pass danger so the safe button gets focus. */
export function confirmDialog(message: string, options: Options = {}) {
  return open(message, options, null, (accepted) => accepted);
}

/** Resolves the trimmed text, or null when cancelled or left empty. */
export function promptDialog(message: string, options: Options & { maxLength?: number; placeholder?: string } = {}) {
  return open(message, options, options, (accepted, value) => (accepted && value ? value : null));
}
