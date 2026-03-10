/**
 * PlaceholderTab — centered message for tabs not yet implemented.
 */

interface PlaceholderTabProps {
  title: string;
  description?: string;
}

export function PlaceholderTab({ title, description }: PlaceholderTabProps) {
  return (
    <div className="placeholder-tab">
      <div className="placeholder-title">{title}</div>
      {description && <div className="placeholder-desc">{description}</div>}
    </div>
  );
}
