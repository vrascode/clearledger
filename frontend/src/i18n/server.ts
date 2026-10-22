import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { localeCookie, resolveLocale } from "./config";
export const requestLocale = cache(async () =>
  resolveLocale(
    (await cookies()).get(localeCookie)?.value,
    (await headers()).get("accept-language"),
  ),
);
