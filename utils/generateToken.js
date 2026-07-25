import jwt from 'jsonwebtoken';

const generateToken = (id) => {
  return jwt.sign({ id }, 'your-super-secret-jwt-key-change-this-in-production', {
    expiresIn: '7d'
  });
};

export default generateToken;
