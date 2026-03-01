const mongoose = require("mongoose");
// const URI ='mongodb+srv://root:admin@cluster0-jim6x.mongodb.net/test?retryWrites=true&w=majority';
const URI = process.env.MONGODB_URI;
mongoose.set('strictQuery', true);
mongoose.connect(URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then((db) => console.log("Db is connected"))
  .catch((err) => console.log(err));
