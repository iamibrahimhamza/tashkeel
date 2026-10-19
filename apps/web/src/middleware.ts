import { NextResponse, type NextRequest } from "next/server";

/**
 * Exposes the request path to server layouts (for the active nav item) and turns away
 * signed-out visitors from private areas before any rendering happens.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if ((pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) && !req.cookies.has("tk_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] };
