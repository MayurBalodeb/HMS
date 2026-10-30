const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');
const ctrl = require('../controllers/staffController');
const crudFactory = require('../utils/crudFactory');

router.get('/', auth, requireRole(['admin']), ctrl.getAll);
router.post('/', auth, requireRole(['admin']), require('../controllers/authController').createStaff);
router.put('/:id', auth, requireRole(['admin']), ctrl.update);
router.delete('/:id', auth, requireRole(['admin']), ctrl.remove);


// Departments (master data) nested under the same router file for simplicity
const deptCrud = crudFactory({ table: 'departments', entityName: 'Department', allowedFields: ['name', 'description'], orderBy: 'name ASC' });
router.get('/departments/all', auth, deptCrud.getAll);
router.post('/departments', auth, requireRole(['admin']), deptCrud.create);
router.put('/departments/:id', auth, requireRole(['admin']), deptCrud.update);
router.delete('/departments/:id', auth, requireRole(['admin']), deptCrud.remove);

module.exports = router;
