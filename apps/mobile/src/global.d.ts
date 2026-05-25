// Type declarations for non-TS imports handled by Metro / the web bundler.

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css';
