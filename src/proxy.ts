import { NextResponse, type NextRequest } from "next/server";
import { can, homeFor, isPublicPath, permissionForPath } from "@/lib/auth/permissions";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";

/**
 * Page-level gate. Pages/actions/routes re-check permissions themselves; this just keeps
 * the wrong role from ever rendering a screen it can't use (including direct URL access).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const needed = permissionForPath(pathname);

  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (!can(session.role, needed)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not allowed for your role." }, { status: 403 });
    const url = new URL(homeFor(session.role), request.url);
    url.searchParams.set("denied", "1");
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon|apple-icon|robots.txt|manifest|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|map|txt|woff2?)$).*)"],
};
