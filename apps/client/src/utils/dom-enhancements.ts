/**
 * Progressive enhancements for native <dialog closedby="any"> light-dismiss
 * and HTML5 :user-invalid ARIA synchronization (per modern-web-guidance).
 */

const initializedDialogs = new WeakSet<HTMLDialogElement>();

export function attachDialogLightDismissFallback(
  dialog: HTMLDialogElement | null,
): void {
  if (!dialog || initializedDialogs.has(dialog)) {
    return;
  }
  initializedDialogs.add(dialog);

  // Reset stale returnValue on close so Esc/backdrop dismiss never leaks a prior button value
  dialog.addEventListener('close', () => {
    dialog.returnValue = '';
  });

  if (
    typeof HTMLDialogElement !== 'undefined' &&
    !('closedBy' in HTMLDialogElement.prototype)
  ) {
    const isOutside = (e: PointerEvent): boolean => {
      const rect = dialog.getBoundingClientRect();
      return (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
    };

    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    });
    dialog.addEventListener('pointerup', (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    });
  }
}

export function openModalDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog) {
    return;
  }
  attachDialogLightDismissFallback(dialog);
  if (!dialog.open) {
    dialog.showModal();
  }
}

export function closeModalDialog(dialog: HTMLDialogElement | null): void {
  if (dialog && dialog.open) {
    dialog.close();
  }
}

interface FieldInteractionState {
  hasInteracted: boolean;
  hasBlurred: boolean;
}

const dirtyFields = new WeakMap<HTMLInputElement, FieldInteractionState>();
const initializedForms = new WeakSet<EventTarget>();

export function initProgressiveFormValidation(
  root: Document | HTMLElement,
): void {
  if (typeof window === 'undefined' || initializedForms.has(root)) {
    return;
  }
  initializedForms.add(root);

  const supportsUserInvalid =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('selector(:user-invalid)');

  const syncNativeAria = (target: EventTarget | null): void => {
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const invalid = target.matches(':user-invalid');
    target.setAttribute('aria-invalid', invalid ? 'true' : 'false');
  };

  if (supportsUserInvalid) {
    root.addEventListener('blur', (e) => syncNativeAria(e.target), true);
    root.addEventListener('input', (e) => {
      if (
        e.target instanceof HTMLInputElement &&
        e.target.hasAttribute('aria-invalid')
      ) {
        syncNativeAria(e.target);
      }
    });
    return;
  }

  const updateFallbackState = (input: HTMLInputElement): void => {
    const isValid = input.checkValidity();
    input.classList.toggle('user-invalid-fallback', !isValid);
    input.classList.toggle('user-valid-fallback', isValid);
    if (!isValid) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  };

  root.addEventListener(
    'blur',
    (e) => {
      if (!(e.target instanceof HTMLInputElement)) {
        return;
      }
      const state = dirtyFields.get(e.target) ?? {
        hasInteracted: false,
        hasBlurred: false,
      };
      state.hasBlurred = true;
      dirtyFields.set(e.target, state);
      if (state.hasInteracted) {
        updateFallbackState(e.target);
      }
    },
    true,
  );

  root.addEventListener('input', (e) => {
    if (!(e.target instanceof HTMLInputElement)) {
      return;
    }
    const state = dirtyFields.get(e.target) ?? {
      hasInteracted: false,
      hasBlurred: false,
    };
    state.hasInteracted = true;
    dirtyFields.set(e.target, state);
    if (state.hasBlurred) {
      updateFallbackState(e.target);
    }
  });
}
