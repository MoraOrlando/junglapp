import * as XLSX from 'xlsx';

export const PRODUCT_CATEGORIES = ['Alimentos', 'Juguetes', 'Accesorios', 'Higiene', 'Salud', 'Ropa', 'Transporte', 'Camas'];

export interface ProductRow {
  row: number;
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  categoria: string;
  error?: string;
}

export function validateProductRow(raw: Record<string, any>, index: number): ProductRow {
  const nombre = String(raw['nombre'] ?? raw['Nombre'] ?? '').trim();
  const descripcion = String(raw['descripcion'] ?? raw['Descripción'] ?? raw['Descripcion'] ?? '').trim();
  const precioRaw = raw['precio'] ?? raw['Precio'] ?? raw['precio (CLP)'] ?? '';
  const stockRaw = raw['stock'] ?? raw['Stock'] ?? '';
  const categoriaRaw = String(raw['categoria'] ?? raw['Categoría'] ?? raw['Categoria'] ?? '').trim();

  const precio = Number(String(precioRaw).replace(/[^0-9.]/g, ''));
  const stock = Number(String(stockRaw).replace(/[^0-9]/g, ''));

  const errors: string[] = [];
  if (!nombre) errors.push('nombre vacío');
  if (!precio || isNaN(precio) || precio <= 0) errors.push('precio inválido');
  if (isNaN(stock) || stock < 0) errors.push('stock inválido');

  const categoriaMatch = PRODUCT_CATEGORIES.find((c) => c.toLowerCase() === categoriaRaw.toLowerCase());

  return {
    row: index + 2,
    nombre,
    descripcion,
    precio: isNaN(precio) ? 0 : precio,
    stock: isNaN(stock) ? 0 : stock,
    categoria: categoriaMatch ?? 'Alimentos',
    error: errors.length ? errors.join(', ') : undefined,
  };
}

export function parseProductWorkbook(data: string | ArrayBuffer): ProductRow[] {
  const wb = XLSX.read(data, { type: 'binary' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return raw.map((r, i) => validateProductRow(r, i));
}

export function downloadProductTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['nombre', 'descripcion', 'precio', 'stock', 'categoria'],
    ['Croquetas Premium 10kg', 'Alimento balanceado para perros adultos', 25000, 50, 'Alimentos'],
    ['Pelota de goma', 'Juguete resistente para perros', 4990, 100, 'Juguetes'],
    ['Correa retráctil 5m', 'Correa extensible hasta 5 metros', 12990, 30, 'Accesorios'],
  ]);
  ws['!cols'] = [{ wch: 30 }, { wch: 40 }, { wch: 12 }, { wch: 8 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');
  XLSX.writeFile(wb, 'plantilla_productos.xlsx');
}
