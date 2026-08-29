# Boutique en ligne + CinetPay

Cette version est un front-end statique prêt à personnaliser.

## Important

Un navigateur ne doit pas contenir de clé secrète CinetPay. La création de la transaction CinetPay doit être faite côté serveur/backend.

### Pour personnaliser
- Produits : `app.js`
- Apparence : `style.css`
- Configuration : `config.js`
- Page principale : `index.html`

## Déploiement
Le front-end peut être publié sur GitHub Pages, Netlify ou Vercel.

## CinetPay
Après création et validation du compte marchand, crée un petit backend `/api/create-payment` qui :
1. reçoit la commande,
2. vérifie les prix côté serveur,
3. appelle l'API CinetPay avec la clé secrète,
4. renvoie l'URL de paiement au navigateur.

Ne demande jamais au client son numéro de carte directement dans ton propre site.
