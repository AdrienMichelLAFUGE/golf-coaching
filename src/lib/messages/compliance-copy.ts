import "server-only";

export const MESSAGE_CHARTER_TEMPLATE = {
  title: "Charte de messagerie et protection des mineurs",
  body: `En utilisant la messagerie de {ORG_NAME}, vous acceptez les regles suivantes:
- usage strictement pedagogique et sportif
- respect des personnes, interdiction de harcelement, menaces et contenus degradants
- pas de partage de coordonnees personnelles (email, telephone, reseaux sociaux) avec un mineur
- les echanges peuvent etre consultes par les administrateurs habilites en cas de signalement
- tout abus peut entrainer gel de conversation, suspension de compte et escalade interne
Contact: {DPO_OR_SUPPORT_EMAIL}`,
  orgNamePlaceholder: "{ORG_NAME}",
  supportEmailPlaceholder: "{DPO_OR_SUPPORT_EMAIL}",
} as const;

export const MESSAGE_PRIVACY_NOTICE_TEMPLATE = `Messagerie interne {ORG_NAME}
Finalites: communication pedagogique coach/eleve et coordination d equipe.
Base legale: execution du contrat B2B et interet legitime de securite/safeguarding.
Destinataires: participants autorises, administrateurs habilites (en cas de signalement), support technique.
Conservation: selon politique de structure (minimum 30 jours, maximum 3650 jours), puis purge/redaction automatique.
Droit a l effacement: en cas de suppression de compte, l auteur est anonymise dans l historique quand la conservation est requise.
Droits RGPD: acces, export, rectification, effacement, limitation, opposition, portabilite.
Sous-traitants techniques: hebergement/app et base de donnees sous DPA. DPA disponible sur demande.
Contact DPO/support: {DPO_OR_SUPPORT_EMAIL}.`;

export const MESSAGE_CGU_ADDITIONAL_TEMPLATE = `Usage messagerie {ORG_NAME}
- outil reserve aux echanges professionnels d accompagnement sportif
- interdiction de partage de coordonnees personnelles avec un mineur
- signalement disponible dans chaque conversation
- la structure peut geler un canal et auditer les signalements
- les violations peuvent entrainer suspension d acces
Contact: {DPO_OR_SUPPORT_EMAIL}.`;
