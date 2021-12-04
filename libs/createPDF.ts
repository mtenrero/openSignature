// @ts-nocheck
import labelmake from "labelmake";
import { basePDF } from '../templates/basePDF';

export async function generatePDF(contents: any) {

    const inputs = {
        name: contents.name || "",
        agreement: contents.agreement || "",
        company: contents.company || "",
        footer_left: contents.footer_left || "",
        footer_right: contents.footer_right || "",
        signature_header: "Firma",
        signer_name: contents.signer_name || ""
    }
    const template = basePDF
    const pdf = await labelmake({ template, inputs })
    console.log(inputs)
    return pdf
}