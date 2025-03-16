import express from 'express';
import { get_bsv_price, get_bsv_price_history } from '../controllers/bsvPriceController';

const router = express.Router();

// Get current BSV price
router.get('/', get_bsv_price);

// Get BSV price history
router.get('/history', get_bsv_price_history);

export default router;
