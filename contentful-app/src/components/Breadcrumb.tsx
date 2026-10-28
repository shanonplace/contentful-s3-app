import { ChevronRightIcon } from "@contentful/f36-icons";
import { css } from "@emotion/css";
import tokens from "@contentful/f36-tokens";

const styles = {
  container: css({
    display: "flex",
    alignItems: "center",
    gap: tokens.spacing2Xs,
    fontSize: tokens.fontSizeM,
    flexWrap: "wrap",
  }),
  segment: css({
    cursor: "pointer",
    padding: `${tokens.spacing2Xs} ${tokens.spacingXs}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.blue600,
    "&:hover": {
      backgroundColor: tokens.blue100,
    },
  }),
  currentSegment: css({
    padding: `${tokens.spacing2Xs} ${tokens.spacingXs}`,
    color: tokens.gray900,
    fontWeight: tokens.fontWeightMedium,
  }),
  separator: css({
    color: tokens.gray500,
    display: "flex",
    alignItems: "center",
  }),
};

interface BreadcrumbProps {
  path: string;
  onClick: (path: string) => void;
}

export function Breadcrumb({ path, onClick }: BreadcrumbProps) {
  const segments = path.split("/").filter((s) => s.length > 0);

  const handleClick = (index: number) => {
    if (index === -1) {
      onClick("");
    } else {
      onClick(segments.slice(0, index + 1).join("/") + "/");
    }
  };

  return (
    <div className={styles.container}>
      {segments.length === 0 ? (
        <span className={styles.currentSegment}>Root</span>
      ) : (
        <>
          <span className={styles.segment} onClick={() => handleClick(-1)}>
            Root
          </span>

          {segments.map((segment, index) => (
            <span key={index} style={{ display: "flex", alignItems: "center" }}>
              <span className={styles.separator}>
                <ChevronRightIcon size="small" />
              </span>
              {index === segments.length - 1 ? (
                <span className={styles.currentSegment}>{segment}</span>
              ) : (
                <span className={styles.segment} onClick={() => handleClick(index)}>
                  {segment}
                </span>
              )}
            </span>
          ))}
        </>
      )}
    </div>
  );
}
