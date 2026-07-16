const ExcelJS = require("exceljs");

const ORANGE = "FFF97316";
const ORANGE_LIGHT = "FFFFF3E8";
const PURPLE_LIGHT = "FFF3E8FF";

const buildCatalogWorkbook = (products, categoryNames = {}) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Solnatura";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Catálogo", {
        views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = [
        { header: "Código", key: "codigo", width: 18 },
        { header: "Nombre", key: "nombre", width: 38 },
        { header: "Categoría", key: "categoria", width: 28 },
        { header: "Precio", key: "precio", width: 16 },
        { header: "Precio anterior", key: "precioAnterior", width: 18 },
        { header: "Stock", key: "stock", width: 12 },
        { header: "Ciclo", key: "ciclo", width: 16 },
        { header: "Vigente", key: "vigente", width: 12 },
    ];

    products.forEach((product) => {
        sheet.addRow({
            codigo: product.codigo || "",
            nombre: product.title || "",
            categoria: categoryNames[product.categoria] || product.categoria || "",
            precio: Number(product.precio) || 0,
            precioAnterior: Number(product.precioAnterior) || 0,
            stock: Number(product.cantidad) || 0,
            ciclo: product.ciclo || "",
            vigente: product.estado ? "Sí" : "No",
        });
    });

    const header = sheet.getRow(1);
    header.height = 24;
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.alignment = { vertical: "middle", horizontal: "center" };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ORANGE } };

    sheet.autoFilter = { from: "A1", to: "H1" };
    sheet.getColumn("precio").numFmt = '"$"#,##0';
    sheet.getColumn("precioAnterior").numFmt = '"$"#,##0';
    sheet.getColumn("stock").alignment = { horizontal: "center" };
    sheet.getColumn("vigente").alignment = { horizontal: "center" };

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.alignment = { ...row.alignment, vertical: "middle" };
        if (row.getCell("vigente").value === "No") {
            row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE_LIGHT } };
        } else if (Number(row.getCell("stock").value) <= 0) {
            row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ORANGE_LIGHT } };
        }
    });

    return workbook;
};

module.exports = buildCatalogWorkbook;
