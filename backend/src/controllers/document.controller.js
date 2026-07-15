import Document from '../models/Document.js';
const owned=(req)=>({_id:req.params.id,userId:req.user._id});
export async function list(req,res){const documents=await Document.find({userId:req.user._id,status:{$ne:'archived'}}).sort({updatedAt:-1}).lean();res.json({documents});}
export async function create(req,res){try{const document=await Document.create({...req.body,userId:req.user._id,status:'draft'});res.status(201).json({document});}catch(error){res.status(422).json({error:error.message});}}
export async function update(req,res){const document=await Document.findOneAndUpdate(owned(req),{$set:req.body},{new:true,runValidators:true});if(!document)return res.status(404).json({error:'Document not found'});res.json({document});}
export async function remove(req,res){const document=await Document.findOneAndUpdate(owned(req),{$set:{status:'archived'}},{new:true});if(!document)return res.status(404).json({error:'Document not found'});res.json({document});}
