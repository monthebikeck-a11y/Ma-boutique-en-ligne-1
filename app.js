const products = [
  {id:1,name:"Produit Premium",price:15000,emoji:"🛍️",description:"Un article élégant pour votre quotidien."},
  {id:2,name:"Pack Essentiel",price:25000,emoji:"📦",description:"Un pack pratique avec tout ce qu'il vous faut."},
  {id:3,name:"Collection Classic",price:30000,emoji:"✨",description:"Un produit classique et facile à offrir."},
  {id:4,name:"Accessoire Plus",price:10000,emoji:"🎁",description:"Le petit complément idéal."},
  {id:5,name:"Pack Découverte",price:20000,emoji:"⭐",description:"Découvrez notre sélection."},
  {id:6,name:"Édition Spéciale",price:45000,emoji:"🏆",description:"Notre sélection haut de gamme."}
];

let cart = JSON.parse(localStorage.getItem("cart") || "[]");

const money = n => new Intl.NumberFormat("fr-FR").format(n) + " FCFA";

function save(){localStorage.setItem("cart",JSON.stringify(cart));}
function renderProducts(){
  document.getElementById("productGrid").innerHTML = products.map(p=>`
    <article class="product">
      <div class="product-img">${p.emoji}</div>
      <div class="product-body">
        <h3>${p.name}</h3><p>${p.description}</p>
        <div class="price">${money(p.price)}</div>
        <button class="primary" onclick="addToCart(${p.id})">Ajouter au panier</button>
      </div>
    </article>`).join("");
}
function addToCart(id){
  const item=cart.find(x=>x.id===id);
  item ? item.qty++ : cart.push({id,qty:1});
  save(); renderCart(); openCart();
}
function changeQty(id,delta){
  const item=cart.find(x=>x.id===id); if(!item)return;
  item.qty+=delta; if(item.qty<=0)cart=cart.filter(x=>x.id!==id);
  save();renderCart();
}
function renderCart(){
  const items=document.getElementById("cartItems");
  document.getElementById("cartCount").textContent=cart.reduce((s,x)=>s+x.qty,0);
  let total=0;
  items.innerHTML=cart.length?cart.map(x=>{
    const p=products.find(y=>y.id===x.id), sub=p.price*x.qty; total+=sub;
    return `<div class="cart-row"><div class="grow"><strong>${p.name}</strong><div>${money(p.price)}</div><div class="qty"><button onclick="changeQty(${p.id},-1)">−</button><span>${x.qty}</span><button onclick="changeQty(${p.id},1)">+</button></div></div><strong>${money(sub)}</strong></div>`;
  }).join(""):"<p>Votre panier est vide.</p>";
  document.getElementById("cartTotal").textContent=money(total);
  document.getElementById("checkoutBtn").disabled=!cart.length;
}
function openCart(){document.getElementById("cart").classList.add("open");document.getElementById("overlay").classList.remove("hidden")}
function closeCart(){document.getElementById("cart").classList.remove("open");document.getElementById("overlay").classList.add("hidden")}
function openModal(){if(!cart.length)return;document.getElementById("checkoutModal").classList.remove("hidden");}
function closeModal(){document.getElementById("checkoutModal").classList.add("hidden");}

document.getElementById("cartBtn").onclick=openCart;
document.getElementById("closeCart").onclick=closeCart;
document.getElementById("overlay").onclick=closeCart;
document.getElementById("checkoutBtn").onclick=()=>{closeCart();openModal()};
document.getElementById("closeModal").onclick=closeModal;

document.getElementById("checkoutForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const message=document.getElementById("paymentMessage");
  const order={
    orderId:"CMD-"+Date.now(),
    customer:{
      name:document.getElementById("customerName").value.trim(),
      email:document.getElementById("customerEmail").value.trim(),
      phone:document.getElementById("customerPhone").value.trim(),
      country:document.getElementById("customerCountry").value
    },
    items:cart.map(x=>({productId:x.id,quantity:x.qty})),
    total:cart.reduce((s,x)=>s+(products.find(p=>p.id===x.id).price*x.qty),0),
    currency:STORE_CONFIG.currency
  };

  if(!STORE_CONFIG.cinetpay.enabled){
    message.classList.remove("hidden");
    message.textContent="La boutique fonctionne, mais le paiement CinetPay n'est pas encore connecté. Il faut d'abord créer le compte marchand et brancher un petit backend sécurisé.";
    console.log("Commande prête pour CinetPay:",order);
    return;
  }

  try{
    const r=await fetch(STORE_CONFIG.cinetpay.apiEndpoint,{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(order)
    });
    const data=await r.json();
    if(!r.ok || !data.payment_url) throw new Error(data.message||"Erreur de paiement");
    window.location.href=data.payment_url;
  }catch(err){
    message.classList.remove("hidden");
    message.textContent="Impossible de lancer le paiement pour le moment. Vérifiez la configuration CinetPay.";
    console.error(err);
  }
});

renderProducts();renderCart();
