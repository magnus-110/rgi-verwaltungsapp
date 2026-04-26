export const RgiWordmark = () => (
  <div className="flex items-center gap-2">
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      className="text-primary"
      aria-hidden="true"
    >
      <path
        d="M3 11L12 3l9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
    <div className="flex items-baseline gap-1.5 leading-none">
      <span className="font-display font-bold text-foreground text-[15px] tracking-tight">
        RGI
      </span>
      <span className="text-muted-foreground tracking-[0.18em] text-[10px] font-medium">
        IMMOBILIEN
      </span>
    </div>
  </div>
);
