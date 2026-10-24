export function websiteOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    url.hostname.includes("*")
  )
    throw new Error(
      "VerdictAI website URL must be an origin without credentials, path, query or fragment.",
    );
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error(
      "Use HTTPS, or HTTP on localhost/127.0.0.1 for development.",
    );
  if (url.origin === "https://web.whatsapp.com")
    throw new Error("The investigation website must have its own origin.");
  return url.origin;
}

// Replaced by esbuild. The fallback also permits direct unit testing without bundling.
declare const __VERDICTAI_WEBSITE_ORIGIN__: string;
export const WEBSITE_ORIGIN =
  typeof __VERDICTAI_WEBSITE_ORIGIN__ === "undefined"
    ? "http://localhost:3000"
    : __VERDICTAI_WEBSITE_ORIGIN__;
