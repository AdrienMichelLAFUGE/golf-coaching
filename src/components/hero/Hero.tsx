"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import styles from "./hero.module.css";
import OrbitScene from "./OrbitScene";
import { smoothstep } from "./orbitMath";
import { MORPH_END, MORPH_START } from "./timings";
import LoginRoleSelectorButton from "@/components/marketing/LoginRoleSelectorButton";

export default function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 899px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const isStatic = Boolean(reducedMotion) || isMobile;

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const introOpacity = useTransform(scrollYProgress, (p) =>
    isStatic ? 0 : 1 - smoothstep(0.02, MORPH_START - 0.04, p)
  );
  const introY = useTransform(scrollYProgress, (p) =>
    isStatic ? 0 : -8 * smoothstep(0.02, MORPH_START - 0.04, p)
  );

  const avantOpacity = useTransform(scrollYProgress, (p) => {
    if (isStatic) return 0;
    const enter = smoothstep(MORPH_START - 0.07, MORPH_START + 0.03, p);
    const exit = smoothstep(MORPH_START + 0.10, MORPH_END - 0.10, p);
    return enter * (1 - exit);
  });
  const avantY = useTransform(scrollYProgress, (p) => {
    if (isStatic) return 0;
    const enter = smoothstep(MORPH_START - 0.07, MORPH_START + 0.03, p);
    const exit = smoothstep(MORPH_START + 0.10, MORPH_END - 0.10, p);
    return 10 * (1 - enter) + -8 * exit;
  });

  const apresOpacity = useTransform(scrollYProgress, (p) => {
    if (isStatic) return 0;
    // Keep the "Apres" message visible longer before the final CTA lands.
    // Shorter "Apres" presence: earlier exit and slightly later enter.
    const enter = smoothstep(MORPH_START + 0.10, MORPH_END - 0.24, p);
    const exit = smoothstep(MORPH_END - 0.02, MORPH_END + 0.10, p);
    return enter * (1 - exit);
  });
  const apresY = useTransform(scrollYProgress, (p) => {
    if (isStatic) return 0;
    const enter = smoothstep(MORPH_START + 0.10, MORPH_END - 0.24, p);
    const exit = smoothstep(MORPH_END - 0.02, MORPH_END + 0.10, p);
    return 10 * (1 - enter) + -8 * exit;
  });

  const finalOpacity = useTransform(scrollYProgress, (p) =>
    // Make the final CTA land earlier so it remains visible longer before leaving sticky.
    isStatic ? 1 : smoothstep(MORPH_END + 0.02, MORPH_END + 0.10, p)
  );
  const finalY = useTransform(scrollYProgress, (p) =>
    isStatic ? 0 : 10 * (1 - smoothstep(MORPH_END + 0.02, MORPH_END + 0.10, p))
  );

  // Static modes: show only the final message.
  if (isStatic) {
    return (
      <section ref={heroRef} className={styles.hero}>
        <div className={styles.grid}>
          <div className={styles.left}>
            <div className={styles.narrative}>
              <div className={`${styles.layer} ${styles.layerFinal}`} style={{ opacity: 1, transform: "none" }}>
                <p className={styles.kicker}>SwingFlow</p>
                <h1 className={styles.title}>
                  Decouvrez SwingFlow,{" "}
                  <span className={styles.titleBreak}>votre coaching, enfin centralisé.</span>
                </h1>
                <p className={styles.copy}>
                  Centralisez eleves, tests et donnees (TPI, Trackman...) pour un coaching plus clair et plus constant.
                </p>
                <div className={styles.ctaRow}>
                  <Link href="/login/coach?mode=signup" className={styles.ctaPrimary}>
                    Creer un compte coach
                  </Link>
                  <LoginRoleSelectorButton
                    location="landing_hero_static"
                    className={styles.ctaSecondary}
                  />
                </div>
                <p className={styles.smallLine}>
                  Le compte eleve se cree via invitation coach.
                </p>
              </div>
            </div>
          </div>

          <div className={styles.sceneCol}>
            <div className={styles.sticky}>
              <OrbitScene heroRef={heroRef} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={heroRef}
      className={styles.hero}
    >
      <div className={styles.grid}>
        <div className={styles.left}>
          <div className={styles.narrative}>
            <motion.div className={styles.layer} style={{ opacity: introOpacity, y: introY }}>
              <p className={styles.kicker}>le chaos</p>
              <h1 className={styles.title}>
                Trop de données, pas assez de clarté ?
              </h1>
              <p className={styles.copy}>
  
              </p>
            </motion.div>

            <motion.div className={styles.layer} style={{ opacity: avantOpacity, y: avantY }}>
              <p className={styles.storyKicker}>Avant</p>
              <ul className={styles.storyList}>
                <li>Outils dispersés, exports dans tous les sens, des notes et des fichiers partout.</li>
                <li>Du temps perdu et un suivi élève moins lisible.</li>
                <li>Difficile de garder une méthode constante.</li>
              </ul>
            </motion.div>

            <motion.div className={styles.layer} style={{ opacity: apresOpacity, y: apresY }}>
              <p className={styles.storyKicker}>Imaginez tout cela au même endroit...</p>
            
            </motion.div>

            <motion.div className={`${styles.layer} ${styles.layerFinal}`} style={{ opacity: finalOpacity, y: finalY }}>
              <p className={styles.kicker}>SwingFlow</p>
              <h1 className={styles.title}>
                Bienvenue sur SwingFlow, <span className={styles.titleBreak}>votre coaching enfin centralisé.</span>
              </h1>
              <p className={styles.copy}>
                Centralisez : élèves, tests, fiches d&apos;entraînement et données (TPI, Trackman...) pour un coaching plus clair et plus constant.
              </p>
              <div className={styles.ctaRow}>
                <Link href="/login/coach?mode=signup" className={styles.ctaPrimary}>
                  Creer un compte coach
                </Link>
                <LoginRoleSelectorButton
                  location="landing_hero_final"
                  className={styles.ctaSecondary}
                />
              </div>
              <p className={styles.smallLine}>
                Le compte eleve se cree via invitation coach.
              </p>
            </motion.div>
          </div>
        </div>

        <div className={styles.sceneCol}>
          <div className={styles.sticky}>
            <OrbitScene heroRef={heroRef} />
          </div>
        </div>
      </div>
    </section>
  );
}
