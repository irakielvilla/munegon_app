import { type ComponentChildren } from 'preact';

interface ModalOverlayProps {
  children: ComponentChildren;
  isPopup?: boolean;
}

export default function ModalOverlay({ children, isPopup = false }: ModalOverlayProps) {
  const overlayClass = isPopup ? 'popup-overlay' : 'modal-overlay';
  
  return (
    <div class={overlayClass}>
      {children}
    </div>
  );
}
