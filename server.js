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

const transactions = new Map();

app.get('/', (req, res) => {
  res.send('PagoSeguro API OK');
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

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});
