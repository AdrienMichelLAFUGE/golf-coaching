import styles from "./demo.module.css";

type CoachmarkProps = {
  label?: string;
  className?: string;
};

export default function Coachmark({
  label = "Clique ici",
  className,
}: CoachmarkProps) {
  return (
    <span data-testid="coachmark" className={`${styles.coachmark} ${className ?? ""}`}>
      {label}
    </span>
  );
}
