import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import usersRouter from './routes/users.js';
import ticketsRouter from './routes/tickets.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/users', usersRouter);
app.use('/tickets', ticketsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
