import * as pdfMake from 'pdfmake';
import moment from 'moment';

export async function createPDFAgreement(contents: any) {

    const docDefinition = {
        // ...
    };
      
    const options = {
    // ...
    }

    var fonts = {
        Courier: {
          normal: 'Courier',
          bold: 'Courier-Bold',
          italics: 'Courier-Oblique',
          bolditalics: 'Courier-BoldOblique'
        },
        Helvetica: {
          normal: 'Helvetica',
          bold: 'Helvetica-Bold',
          italics: 'Helvetica-Oblique',
          bolditalics: 'Helvetica-BoldOblique'
        },
    }

    var printer = new pdfMake(fonts);

    const inputs = {
        name: contents.name || "",
        agreement: contents.agreement || "",
        company: contents.company || "",
        footer_left: contents.footer_left || "",
        footer_right: contents.footer_right || "",
        signature_header: "Firma",
        signer_name: contents.signer_name || "",
        signature: contents.signature || ""
    }

    const doc = {
        content: [
            { text: "Barvet", fontSize: 15, bold: true},
            { text: "Veterinaria a domicilio", margin: [0,0,0,20]},
            { text: inputs.name, fontSize: 20, bold: true, alignment: "center", margin: [0, 0, 0, 15]},
            inputs.agreement ,
            { text: `Firmado digitalmente el día ${moment().format("DD/MM/YYYY")}`, margin: [0, 30, 0, 0], alignment: "right"},
            { 
                image: inputs.signature,
                width: 250,
                alignment: 'right'
                
            }
        ],
        defaultStyle: {
            font: 'Helvetica'
        }
        
    }

    const pdf = printer.createPdfKitDocument(doc)
    pdf.end()

    return pdf
}