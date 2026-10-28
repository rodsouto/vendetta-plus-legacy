// The rulebook (docs/spec/rulebook.md, B-13, B-23): what the arbiter judges and sanctions with a
// suspension (B-14). The text lives in i18n as blocks: a string is a paragraph, `ul` / `ol` a list.
import { useTranslation } from "react-i18next";

type Block = string | { ul: string[] } | { ol: string[] };
type Section = { title: string; body: Block[] };

export function Rules() {
  const { t } = useTranslation();
  const sections = t("rules.sections", { returnObjects: true }) as Section[];
  return (
    <>
      <header className="account-head">
        <h2>{t("rules.title")}</h2>
      </header>
      <p className="note">{t("rules.intro")}</p>
      <div className="rules">
        {sections.map((s, i) => (
          <section key={s.title}>
            <h3>
              {i + 1}. {s.title}
            </h3>
            {s.body.map((b, j) =>
              typeof b === "string" ? (
                <p key={j}>{b}</p>
              ) : "ol" in b ? (
                <ol key={j}>
                  {b.ol.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ol>
              ) : (
                <ul key={j}>
                  {b.ul.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ul>
              ),
            )}
          </section>
        ))}
      </div>
    </>
  );
}
