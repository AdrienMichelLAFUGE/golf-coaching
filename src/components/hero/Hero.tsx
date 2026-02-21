"use client";

import Link from "next/link";

import styles from "./hero.module.css";

export default function Hero() {
  return (
    <section className={`${styles.hero} ${styles.heroStatic}`}>
      <div className={styles.grid}>
        <div className={styles.left}>
          <div className={styles.narrative}>
            <div className={`${styles.layer} ${styles.layerFinal}`}>
              <p className={styles.kicker}>SwingFlow</p>
              <h1 className={styles.title}>
                Structurez le coaching de golf{" "}
                <span className={styles.titleBreak}>en un seul système.</span>
              </h1>
              <p className={styles.copy}>
                Élèves, séances, TPI, technologies et progression : tout est organisé et relié
                automatiquement.
              </p>
              <p className={styles.copy}>
                Au cœur du système : <span className={styles.tempoWord}>Tempo</span>, l&apos;intelligence
                qui relie vos données à vos décisions de coaching.
              </p>
              <div className={styles.ctaRow}>
                <Link href="/login/coach?mode=signup" className={styles.ctaPrimary}>
                  Créer mon compte
                </Link>
              </div>
              <p className={styles.smallLine}>Pour les coachs et les structures.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
