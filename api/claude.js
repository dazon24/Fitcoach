export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    // Log pour debug : affiche le statut et la réponse d'Anthropic
    console.log("Anthropic status:", response.status);
    console.log("Anthropic response:", JSON.stringify(data));

    res.status(response.status).json(data);
  } catch (err) {
    console.log("Erreur fonction:", String(err));
    res.status(500).json({ error: "Erreur serveur", details: String(err) });
  }
}
