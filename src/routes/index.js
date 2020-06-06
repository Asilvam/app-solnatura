const { Router } = require('express');
const path = require('path');
const { unlink } = require('fs-extra');
const router = Router();

const cloudinary = require('cloudinary');
cloudinary.config(
    {
        cloud_name:'dujg9sojg',
        api_key:'523798586227781',
        api_secret:'2iJczEt0gmTbLlaADGa9LVTj6fw'
    }
);


// Models
const Image = require('../models/Image');
const Categoria = require('../models/Categoria');

router.get('/', async (req, res) => {
    const images = await Image.find({estado:true});
    res.render('index2', { images });
});

router.get('/cat/:id', async (req, res) => {  
    const { id } = req.params;
    const images = await Image.find({estado:true,categoria:id});
    res.render('index2', { images });
});
router.get('/2', async (req, res) => {  
    const images = await Image.find({estado:true,categoria:2});
    res.render('index2', { images });
});
router.get('/3', async (req, res) => {  
    const images = await Image.find({estado:true,categoria:3});
    res.render('index2', { images });
});
router.get('/4', async (req, res) => {  
    const images = await Image.find({estado:true,categoria:4});
    res.render('index2', { images });
});
router.get('/5', async (req, res) => {  
    const images = await Image.find({estado:true,categoria:5});
    res.render('index2', { images });
});
router.get('/6', async (req, res) => {  
    const images = await Image.find({estado:true,categoria:6});
    res.render('index2', { images });
});
router.get('/7', async (req, res) => {  
    const images = await Image.find({estado:true,categoria:7});
    res.render('index2', { images });
});
router.get('/8', async (req, res) => {
    const images = await Image.find({estado:true,categoria:8});
    res.render('index2', { images });
});

router.get('/modecat', async (req, res) => {
    const categorias = await Categoria.find();
    res.render('cat', { categorias });
});

router.post('/modecat', async (req, res) => {
    const categoria = new Categoria();
    // console.log(req.body);
    categoria.nombre = req.body.nombre;
    categoria.codigo = req.body.codigo;
    await categoria.save();
    res.redirect('/modecat');
});

router.get('/mode', async (req, res) => {
    const images = await Image.find();
    res.render('index', { images });
});

router.get('/update/:id', async (req, res, next) => {
    const image = await Image.findById(req.params.id);
    // console.log(image)
    res.render('update', { image });
  });

router.post('/update/:id', async (req, res, next) => {
    const { id } = req.params;

    if(req.body.estado == null) {
        // console.log('Object missing');
        req.body.estado= false;
      }
    await Image.updateOne({_id: id}, req.body);
    res.redirect('/mode');
 });  

router.get('/upload', (req, res) => {
    res.render('upload');
});

router.post('/upload', async (req, res) => {
    const image = new Image();
    const result = await cloudinary.v2.uploader.upload(req.file.path);

    console.log(req.body);

    image.title = req.body.title;
    image.precio = req.body.precio;
    image.cantidad = req.body.cantidad;
    image.codigo = req.body.codigo;
    image.ciclo = req.body.ciclo;
    image.description = req.body.description;
    image.categoria = req.body.categoria;
    image.filename = req.file.filename;
    //image.path = '/img/uploads/' + req.file.filename;
    image.path = result.secure_url;
    image.public_id=  result.public_id;
    //image.estado = req.body.estado;
    image.originalname = req.file.originalname;
    image.mimetype = req.file.mimetype;
    image.size = req.file.size;
    //console.log(result);
    await image.save();
    await unlink(req.file.path);
    //res.redirect('/');
    res.redirect('/upload');
});

router.get('/image/:id', async (req, res) => {
    const { id } = req.params;
    const image = await Image.findById(id);
    res.render('profile', { image });
});

router.get('/image/:id/delete', async (req, res) => {
    const { id } = req.params;
    const imageDeleted = await Image.findByIdAndDelete(id);
    const result = await cloudinary.v2.uploader.destroy(imageDeleted.public_id);
    //console.log(result);
    res.redirect('/mode');
});

router.get('/categoria/:id/delete', async (req, res) => {
    const { id } = req.params;
    const catDeleted = await Categoria.findByIdAndDelete(id);
    //console.log(result);
    res.redirect('/modecat');
});

module.exports = router;