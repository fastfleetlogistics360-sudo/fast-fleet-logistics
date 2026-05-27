import type { ComponentPropsWithoutRef } from "react";

type IconProps = ComponentPropsWithoutRef<"svg">;

export function InstagramIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4c0 3.2-2.6 5.8-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8C2 4.6 4.6 2 7.8 2Zm8.4 2H7.8C5.7 4 4 5.7 4 7.8v8.4C4 18.3 5.7 20 7.8 20h8.4c2.1 0 3.8-1.7 3.8-3.8V7.8C20 5.7 18.3 4 16.2 4ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.3-2.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.24 2h3.26l-7.11 8.13L22.75 22H16.2l-5.13-6.7L5.2 22H1.94l7.6-8.69L1.5 2h6.72l4.64 6.13L18.24 2Zm-1.14 17.9h1.8L7.24 3.99H5.3L17.1 19.9Z" />
    </svg>
  );
}

export function TikTokIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M16.4 3c.38 2.24 1.7 3.58 3.9 3.73v3.18a7.1 7.1 0 0 1-3.78-1.12v6.1c0 3.08-2.1 5.11-5.14 5.11-2.72 0-4.88-1.83-4.88-4.45 0-2.89 2.43-4.85 5.64-4.29v3.28c-1.34-.43-2.38.15-2.38 1.08 0 .8.68 1.3 1.58 1.3 1.03 0 1.8-.59 1.8-2.09V3h3.26Z" />
    </svg>
  );
}

export function GoogleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="#4285F4" d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.37a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.99-4.31 2.99-7.52Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.44l-3.23-2.51c-.9.6-2.04.95-3.38.95-2.6 0-4.81-1.76-5.6-4.13H3.06v2.59A9.99 9.99 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.87a6 6 0 0 1 0-3.74V7.54H3.06a10.01 10.01 0 0 0 0 8.92l3.34-2.59Z" />
      <path fill="#EA4335" d="M12 6c1.47 0 2.79.51 3.83 1.5l2.86-2.86C16.96 3.03 14.7 2 12 2a9.99 9.99 0 0 0-8.94 5.54l3.34 2.59C7.19 7.76 9.4 6 12 6Z" />
    </svg>
  );
}

export function AppleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M16.78 12.76c-.02-2.43 1.99-3.6 2.08-3.66-1.14-1.66-2.9-1.89-3.52-1.91-1.48-.15-2.92.88-3.66.88-.75 0-1.89-.86-3.11-.83-1.6.02-3.08.93-3.9 2.36-1.68 2.91-.43 7.18 1.19 9.53.8 1.15 1.73 2.43 2.97 2.39 1.2-.05 1.65-.77 3.1-.77 1.44 0 1.85.77 3.1.74 1.3-.02 2.11-1.16 2.88-2.32.92-1.32 1.29-2.61 1.3-2.68-.03-.01-2.4-.92-2.43-3.73ZM14.37 5.62c.65-.79 1.09-1.87.97-2.96-.94.04-2.11.64-2.78 1.41-.6.69-1.14 1.82-.99 2.87 1.06.08 2.13-.54 2.8-1.32Z" />
    </svg>
  );
}
