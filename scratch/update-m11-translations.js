const fs = require('fs');

function updateJson(filePath, updates) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  if (!data.communications) data.communications = {};
  if (!data.communications.errors) data.communications.errors = {};
  Object.assign(data.communications.errors, updates.communications.errors);

  if (!data.announcements) data.announcements = {};
  if (!data.announcements.actions) data.announcements.actions = {};
  Object.assign(data.announcements.actions, updates.announcements.actions);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const enUpdates = {
  communications: {
    errors: {
      UNAUTHORIZED: "You do not have permission to manage communications.",
      INVALID_AUDIENCE: "Invalid recipient audience specified.",
      INVALID_CHANNEL: "Selected delivery channel is unsupported.",
      EMPTY_MESSAGE: "Message subject and body cannot be empty.",
      staleTenantAborted: "Stale organization context. Please refresh the page."
    }
  },
  announcements: {
    actions: {
      queuedSuccess: "Announcement successfully queued for dispatch."
    }
  }
};

const frUpdates = {
  communications: {
    errors: {
      UNAUTHORIZED: "Vous n'avez pas la permission de gérer les communications.",
      INVALID_AUDIENCE: "Audience de destinataires spécifiée invalide.",
      INVALID_CHANNEL: "Le canal de distribution sélectionné n'est pas pris en charge.",
      EMPTY_MESSAGE: "Le sujet et le corps du message ne peuvent pas être vides.",
      staleTenantAborted: "Contexte d'organisation obsolète. Veuillez actualiser la page."
    }
  },
  announcements: {
    actions: {
      queuedSuccess: "Annonce mise en file d'attente avec succès pour expédition."
    }
  }
};

updateJson('./messages/en.json', enUpdates);
updateJson('./messages/fr.json', frUpdates);
console.log("Translation files updated successfully.");
