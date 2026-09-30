"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { useRouter } from "@/i18n/routing";

/** Sends a visitor with a join code to the existing /join/[code] flow. */
export function JoinCodeForm() {
  const t = useTranslations("home.how.join");
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  return (
    <form
      className="vc-join-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        // Same normalization as the in-app join-by-code dialog.
        const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
        if (!normalized) {
          setError(true);
          return;
        }
        router.push(`/join/${encodeURIComponent(normalized)}`);
      }}
    >
      <p className="vc-join-hint">{t("codeHint")}</p>
      <label htmlFor={inputId} className="vc-join-label">
        {t("codeLabel")}
      </label>
      <div className="vc-join-row">
        <input
          id={inputId}
          name="code"
          value={code}
          maxLength={20}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={t("codePlaceholder")}
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            if (error) setError(false);
          }}
        />
        <button type="submit" className="vc-btn vc-btn-dark">
          {t("codeSubmit")}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <p id={errorId} className="vc-join-error" role="alert">
          {t("codeError")}
        </p>
      ) : null}
    </form>
  );
}
