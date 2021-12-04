// @ts-nocheck
import { Card, CardHeader, CardBody, CardFooter, Button, CheckBox, ResponsiveContext, Heading, Paragraph, Box } from "grommet"
import moment from "moment";
import { useRouter } from "next/dist/client/router";
import { BaseContext } from "next/dist/shared/lib/utils";
import React, { useEffect, useRef, useState } from "react"
import SignaturePad from "react-signature-pad-wrapper"
import DataFetcher from '../../libs/dataFetcher';
import Handlebars from "handlebars";'handlebars/dist/handlebars.min.js';
import {generatePDF} from '../../libs/createPDF';
const { convert } = require('html-to-text');

export default function SignDocument(props: any) {
    const router = useRouter()
    const { contract } = router.query
    const size = React.useContext(ResponsiveContext);
    const signature = useRef()

    const [acceptChecked, setAcceptChecked] = useState(false)

    const htmlContract = Handlebars.compile(props.contract.template)

    const signAnalogData = () => {
        console.log(signature.current);
        const ctx = signature.current.signaturePad._ctx;
        ctx.fillStyle = "#999999"
        ctx.font = "20px sans-serif"
        const d = props.contract.templateData.date
        const slug = `${d} NAME LAST NAME `
        ctx.fillText(
            `${slug} - ${slug} - ${slug} - ${slug}`,
            0,
            20
        )
    }

    const onClick = async (event) => {
        const blob = await generatePDF({
            name: props.contract.name,
            agreement: convert(htmlContract(props.contract.templateData), {
                wordwrap: 130
              }),
            signer_name: `${props.contract.templateData.name} ${props.contract.templateData.lastname}`
        })
        var fileURL = URL.createObjectURL(blob);
        window.open(fileURL)
    }

    useEffect(() => {
        if (signature.current) {
            signAnalogData()
        }
    })

    return(
        <Box margin={{bottom: "10px"}}>
            <Heading textAlign="center">{ props.contract.name || "Contract" }</Heading>
            <Card alignSelf="center" height={{min: "60%"}} width={{min: "60%", max: "90%"}} background="light-1">
                <CardBody pad={size} style={{textAlign: "justify"}}>
                    <div dangerouslySetInnerHTML={{ __html: htmlContract(props.contract.templateData) }} />
                    
                    <div style={{margin:"15px"}}>

                    <Heading level="3" margin="none">Signature</Heading>
                    <div style={{marginTop: "10px", marginBottom: "10px"}}>
                    Actuando como <b>{props.contract.templateData.name} {props.contract.templateData.lastname}</b> with ID Number <b>{props.contract.templateData.idnum}</b>, phone
                    number {props.contract.templateData.phone} and e-mail address {props.contract.templateData.mail}:
                    </div>
                    <CheckBox
                        label="I accept the terms of this contract"
                        style={{marginTop: "10px"}}
                        onChange={()=> {setAcceptChecked(!acceptChecked)}}
                    />
                    <Box 
                        border
                        style={{marginTop: "10px"}}
                    >
                        <Button label="X" onClick={()=> {
                            signature.current.clear()
                            signAnalogData()}
                            } 
                        />
                        <SignaturePad ref={signature} redrawOnResize canvasProps={{
                            backgroundColor: 'rgb(255, 255, 255)'
                        }}/>
                    </Box>
                    </div>
                    
                
                </CardBody>
                <CardFooter background="light-2">
                    <Button disabled={!acceptChecked} primary margin="5px" hoverIndicator label="Sign" onClick={onClick} />
                </CardFooter>
            </Card>
        </Box>
    )
}

export async function getServerSideProps(context: BaseContext) {
    const {contract} = context.params
    const dfContracts = new DataFetcher({dbName: "esign_contracts"})
    const tenant = await dfContracts.get(contract)
    const dfTenant = new DataFetcher({dbName: `${tenant.tenant}`})
    const contractDetails = await dfTenant.get(`contract:${contract}`)
    contractDetails['templateData']['date']= moment().format('DD/MM/YYYY')
    return {
      props: {
        contract: contractDetails,
      }, // will be passed to the page component as props
    }
  }

function dynamic(arg0: () => Promise<any>, arg1: { ssr: boolean; }) {
    throw new Error("Function not implemented.");
}
  