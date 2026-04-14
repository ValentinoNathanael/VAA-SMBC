import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/login", "/api/auth/login", "/api/auth/init-spoc", "/api/auth/init-internal",];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublicFile = /\.(.*)$/.test(pathname);

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/api/ai") || 
    pathname.startsWith("/api/ask-ai") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname === "/favicon.ico" ||
    isPublicFile
  ) {
    return NextResponse.next();
  }

  const role = req.cookies.get("vaa_role")?.value;

  if (!role) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

