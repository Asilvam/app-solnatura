# Sol Natura

Catálogo de productos construido con Node.js, Express, EJS y MongoDB.

## Configuración

1. Copia `.env.example` como `.env` y completa MongoDB y Cloudinary.
2. Configura el acceso administrativo:

   ```bash
   npm run admin:setup
   ```

   El comando solicita el usuario y la contraseña de manera interactiva. La contraseña se guarda como hash `scrypt`, nunca en texto plano.

3. Inicia la aplicación:

   ```bash
   npm run dev
   ```

La tienda pública está disponible en `/` y el panel protegido en `/mode`.
