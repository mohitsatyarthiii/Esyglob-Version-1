import SubscriptionService from '../services/subscription.service.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import Subscription from '../models/Subscription.js';
import crypto from 'crypto';
import PaymentService from '../services/payment.service.js';

class SubscriptionController {
  static async plans(req,res){try{return res.json(await SubscriptionService.getPlans(req.user,req.query.role));}catch(error){return res.status(error.statusCode||500).json({error:error.message});}}
  static async adminPlans(req,res){try{return res.json({plans:await SubscriptionPlan.find().sort({role:1,priorityRanking:1}).lean()});}catch(error){return res.status(500).json({error:error.message});}}
  static async saveAdminPlan(req,res){try{const plan=await SubscriptionPlan.findOneAndUpdate({key:req.params.key},{$set:req.body},{new:true,upsert:true,runValidators:true});return res.json({plan});}catch(error){return res.status(422).json({error:error.message});}}
  static async adminSubscriptions(req,res){try{const subscriptions=await Subscription.find().populate('userId','fullName email roles').sort({updatedAt:-1}).limit(Math.min(Number(req.query.limit)||100,500)).lean();return res.json({subscriptions});}catch(error){return res.status(500).json({error:error.message});}}
  static async webhook(req,res){try{const secret=process.env.RAZORPAY_WEBHOOK_SECRET;if(!secret)return res.status(503).json({error:'Webhook is not configured'});const expected=crypto.createHmac('sha256',secret).update(req.rawBody||Buffer.from('')).digest('hex');const received=String(req.get('x-razorpay-signature')||'');if(expected.length!==received.length||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(received)))return res.status(401).json({error:'Invalid webhook signature'});if(req.body?.event==='payment.captured'){const entity=req.body.payload?.payment?.entity;const notes=entity?.notes||{};if(notes.userId&&notes.planType){const checkoutSignature=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(`${entity.order_id}|${entity.id}`).digest('hex');await PaymentService.verifySubscriptionPayment(notes.userId,{razorpayPaymentId:entity.id,razorpayOrderId:entity.order_id,razorpaySignature:checkoutSignature,planType:notes.planType,duration:notes.duration||'monthly'});}}return res.json({received:true});}catch(error){console.error('[Subscription-Webhook]',error);return res.status(error.statusCode||500).json({error:error.message});}}
  /**
   * GET - Get subscription
   */
  static async get(req, res) {
    try {
      const result = await SubscriptionService.getSubscription(req.user, req.query.role);
      return res.json(result);
    } catch (error) {
      console.error('[Subscription-GET] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch subscription' });
    }
  }

  /**
   * POST - Create subscription order
   */
  static async createOrder(req, res) {
    try {
      const result = await SubscriptionService.createOrder(req.user, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[Subscription-CreateOrder] Error:', error);

      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create subscription' });
    }
  }

  static async changePlan(req, res) {
    try { return res.json(await SubscriptionService.changePlan(req.user, req.body)); }
    catch (error) { return res.status(error.statusCode || 500).json({ error: error.message }); }
  }

  /**
   * PATCH - Toggle auto-renew
   */
  static async toggleAutoRenew(req, res) {
    try {
      const { autoRenew } = req.body;
      const result = await SubscriptionService.toggleAutoRenew(req.user, autoRenew);
      return res.json(result);
    } catch (error) {
      console.error('[Subscription-PATCH] Error:', error);

      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: 'Failed to update auto-renew' });
    }
  }
}

export default SubscriptionController;
