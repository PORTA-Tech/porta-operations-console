interface ConfirmButtonProps {
  label: string;
  onClick: () => void;
}

export function ConfirmButton({ label, onClick }: ConfirmButtonProps) {
  return (
    <button
      onClick={() => {
        if (window.confirm(`Confirm ${label}?`)) onClick();
      }}
    >
      {label}
    </button>
  );
}

