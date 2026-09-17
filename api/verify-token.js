import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Only POST allowed'
        });
    }

    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'Token required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

        return res.status(200).json({
            success: true,
            user: decoded
        });

    } catch (err) {
        return res.status(401).json({
            error: 'Invalid or expired token'
        });
    }
}