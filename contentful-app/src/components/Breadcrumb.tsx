import { ChevronRightIcon } from "@contentful/f36-icons";
import { css } from "@emotion/css";

const styles = {
  container: css({
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "14px",
    flexWrap: "wrap",
  }),
  segment: css({
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: "4px",
    color: "#0066ff",
    "&:hover": {
      backgroundColor: "#f0f7ff",
    },
  }),
  currentSegment: css({
    padding: "4px 8px",
    color: "#333",
    fontWeight: 500,
  }),
  separator: css({
    color: "#999",
    display: "flex",
    alignItems: "center",
  }),
};

interface BreadcrumbProps {
  path: string;
  onClick: (path: string) => void;
}

export function Breadcrumb({ path, onClick }: BreadcrumbProps) {
  // Parse path into segments
  const segments = path
    .split("/")
    .filter((s) => s.length > 0);

  const handleClick = (index: number) => {
    if (index === -1) {
      onClick("");
    } else {
      const newPath = segments.slice(0, index + 1).join("/") + "/";
      onClick(newPath);
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
                <span
                  className={styles.segment}
                  onClick={() => handleClick(index)}
                >
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
