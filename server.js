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
  const { role, email } = req.query;
  const list = [...transactions.values()];
  if (!role || !email) return res.json(list);

  if (role === 'buyer') return res.json(list.filter(t => t.buyerEmail === email));
  if (role === 'seller') return res.json(list.filter(t => t.sellerEmail === email));
  return res.json(list);
});

app.post('/api/transactions/:id/action', (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  const tx = transactions.get(id);
  if (!tx) return res.status(404).json({ error: 'No existe' });

  switch (action) {
    case 'deposit':
      if (tx.status !== TX_STATUS.PENDING_DEPOSIT) return res.status(400).json({ error: 'Estado inválido' });
      tx.status = TX_STATUS.HELD;
      break;
    case 'start-delivery':
      if (tx.status !== TX_STATUS.HELD) return res.status(400).json({ error: 'Estado inválido' });
      tx.status = TX_STATUS.IN_DELIVERY;
      break;
    case 'release':
      if (tx.status !== TX_STATUS.IN_DELIVERY) return res.status(400).json({ error: 'Estado inválido' });
      tx.status = TX_STATUS.COMPLETED;
      break;
    case 'dispute':
      if (tx.status === TX_STATUS.COMPLETED) return res.status(400).json({ error: 'Ya completada' });
      tx.status = TX_STATUS.DISPUTED;
      break;
    default:
      return res.status(400).json({ error: 'Acción no válida' });
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
