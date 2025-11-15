import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { v4 as uuid } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

const TX_STATUS = {
  PENDING_DEPOSIT: 'PENDING_DEPOSIT',
  HELD: 'HELD',
  IN_DELIVERY: 'IN_DELIVERY',
  COMPLETED: 'COMPLETED',
  DISPUTED: 'DISPUTED',
};
// Usuarios de prueba (como si ya estuvieran registrados)
const users = [
  { id: 'U1', name: 'Francisco Requena', phone: '999111222', email: 'fra@gmail.com' },
  { id: 'U2', name: 'Carlos López', phone: '988777666', email: 'carlos@gmail.com' },
  { id: 'U3', name: 'María Pérez', phone: '977333444', email: 'maria@gmail.com' },
];


const transactions = new Map();

app.get('/', (req, res) => {
  res.send('PagoSeguro API OK');
});

app.get('/api/users/by-identifier', (req, res) => {
  const { identifier } = req.query;
  if (!identifier) return res.status(400).json({ error: 'Falta identifier' });

  const normalized = identifier.replace(/\s+/g, '').toLowerCase();

  const user = users.find(u =>
    u.phone.replace(/\s+/g, '').toLowerCase() === normalized ||
    u.email.toLowerCase() === normalized
  );

  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  res.json(user);
});

app.post('/api/transactions', (req, res) => {
  const { buyerEmail, sellerEmail, buyerName, sellerName, item, amount } = req.body;
  if (!buyerEmail || !sellerEmail || !item || !amount) {
    return res.status(400).json({ error: 'Campos incompletos' });
  }

  const id = `PSP-${uuid().slice(0, 8)}`;
  const tx = {
    id,
    buyerEmail,
    sellerEmail,
    buyerName,
    sellerName,
    item,
    amount,
    status: TX_STATUS.PENDING_DEPOSIT,
    createdAt: new Date().toISOString(),
  };
  transactions.set(id, tx);
  res.status(201).json(tx);
});

app.get('/api/transactions', (req, res) => {
  const { role, email, status } = req.query;
  let list = [...transactions.values()];

  if (status) {
    list = list.filter(t => t.status === status);
  }

  if (role && email) {
    if (role === 'buyer') list = list.filter(t => t.buyerEmail === email);
    if (role === 'seller') list = list.filter(t => t.sellerEmail === email);
  }

  res.json(list);
});

app.get('/api/transactions/:id', (req, res) => {
  const { id } = req.params;
  const tx = transactions.get(id);
  if (!tx) return res.status(404).json({ error: 'No existe' });
  res.json(tx);
});

app.post('/api/transactions/:id/action', (req, res) => {
  const { id } = req.params;
  const { action, reason, openedBy } = req.body;
  const tx = transactions.get(id);
  if (!tx) return res.status(404).json({ error: 'No existe' });

  switch (action) {
  case 'deposit':
    // comprador paga → dinero retenido
    tx.status = TX_STATUS.HELD;
    break;

  case 'start-delivery':
    // vendedor empieza entrega
    if (tx.status !== TX_STATUS.HELD) {
      return res.status(400).json({ error: 'No se puede iniciar entrega en este estado' });
    }
    tx.status = TX_STATUS.IN_DELIVERY;
    break;

  case 'release':
    // comprador confirma recepción → transacción completada
    if (tx.status !== TX_STATUS.IN_DELIVERY) {
      return res.status(400).json({ error: 'No se puede confirmar recepción todavía' });
    }
    tx.status = TX_STATUS.COMPLETED;
    break;

  case 'dispute':
    if (tx.status === TX_STATUS.COMPLETED) {
      return res.status(400).json({ error: 'La transacción ya está completada' });
    }
    tx.status = TX_STATUS.DISPUTED;
    tx.dispute = {
      reason: reason || 'Sin motivo detallado',
      openedBy: openedBy || 'unknown',
      openedAt: new Date().toISOString(),
      status: 'OPEN',
    };
    break;

  default:
    return res.status(400).json({ error: 'Acción no válida' });
}

  transactions.set(id, tx);
  res.json(tx);
});


app.post('/api/admin/disputes/:id/resolve', (req, res) => {
  const { id } = req.params;
  const { outcome, operatorNotes } = req.body;

  const tx = transactions.get(id);
  if (!tx) return res.status(404).json({ error: 'No existe' });
  if (tx.status !== TX_STATUS.DISPUTED || !tx.dispute) {
    return res.status(400).json({ error: 'La transacción no está en disputa' });
  }

  // Actualizamos disputa
  tx.dispute.status = 'RESOLVED';
  tx.dispute.outcome = outcome;
  tx.dispute.operatorNotes = operatorNotes || '';
  tx.dispute.resolvedAt = new Date().toISOString();

  // Actualizamos estado de la transacción según outcome
  if (outcome === 'REFUND_BUYER') {
    tx.status = 'REFUNDED_BUYER';
  } else if (outcome === 'RELEASE_SELLER') {
    tx.status = 'RELEASED_TO_SELLER';
  } else {
    // NO_ACTION, se podría dejar en DISPUTED o marcar como cerrado
    tx.status = TX_STATUS.DISPUTED;
  }

  transactions.set(id, tx);
  res.json(tx);
});



// Login simple: por email o teléfono (MVP, sin contraseña)
app.post('/api/login', (req, res) => {
  const { identifier } = req.body; // puede ser email o phone

  const user = users.find(
    u => u.email === identifier || u.phone === identifier
  );

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  // En un sistema real devolverías un token; aquí devolvemos el usuario tal cual
  res.json(user);
});

// Buscar usuario por teléfono, para que salga el nombre como en Yape
app.get('/api/users/by-phone', (req, res) => {
  const { phone } = req.query;
  const user = users.find(u => u.phone === phone);

  if (!user) {
    return res.status(404).json({ error: 'No registrado en PagoSeguro' });
  }

  res.json({ id: user.id, name: user.name, phone: user.phone, email: user.email });
});


const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
