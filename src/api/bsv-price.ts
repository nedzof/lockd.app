import express from 'express';
import { getBsvPrice, getBsvPriceHistory } from '../controllers/bsvPriceController';

const router = express.Router();

// Get current BSV price
router.get('/', getBsvPrice);

// Get BSV price history
router.get('/history', getBsvPriceHistory);

export default router;
