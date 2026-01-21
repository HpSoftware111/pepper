import mongoose from 'mongoose';

const SentenciaSchema = new mongoose.Schema(
  {
    providencia: String,
    expediente: String,
    fecha_sentencia: Date,
    tema: String,
    magistrado: String,
    texto: String,
    url: String,
    derechos: mongoose.Schema.Types.Mixed,
    hechos_relevantes: mongoose.Schema.Types.Mixed,
    sujeto: mongoose.Schema.Types.Mixed,
    conflicto_juridico: mongoose.Schema.Types.Mixed,
  },
  { collection: 'sentencias' },
);

export default mongoose.models.Sentencia || mongoose.model('Sentencia', SentenciaSchema);

