import { useAppStore } from "@/stores/app";
import { SOURCE_LABEL_KEYS } from "@/utils/pointSources";
export function useUserPresentation() {
  const app = useAppStore();
  const t = (key: string) => app.t(`users.${key}`);
  const date = (value?: string | null) =>
    value
      ? new Date(value).toLocaleString(app.locale, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";
  const number = (value: number) => value.toLocaleString(app.locale);
  const signed = (value: number) => (value > 0 ? "+" : "") + number(value);
  const source = (code: string) =>
    Object.hasOwn(SOURCE_LABEL_KEYS, code)
      ? app.t(SOURCE_LABEL_KEYS[code]!)
      : `${t("other")} · ${code}`;
  return { app, t, date, number, signed, source };
}
