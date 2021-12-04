// @ts-nocheck
import { Card, CardHeader, CardBody, CardFooter, Button, CheckBox, ResponsiveContext, Heading, Notification, Box } from "grommet"
import moment from "moment";
import { useRouter } from "next/dist/client/router";
import { BaseContext } from "next/dist/shared/lib/utils";
import React, { useEffect, useRef, useState } from "react"
import SignaturePad from "react-signature-pad-wrapper"
import DataFetcher from '../../libs/dataFetcher';
import Handlebars from "handlebars";
import axios from "axios";
import axiosRetry from 'axios-retry';
import { IconContext } from "react-icons";
import { FiCheck, FiAlertOctagon } from "react-icons/fi";
import ReactLoading from "react-loading";


export default function SignDocument(props: any) {
    const [signing, setSigning] = useState(false)
    const [toastVisible, setToastVisible] = useState(false)
    const [toastData, setToastData] = useState({
        title: "Notificación",
        message: ""
    })
    const router = useRouter()
    const { contract } = router.query
    const size = React.useContext(ResponsiveContext);
    const signature = useRef()

    const [acceptChecked, setAcceptChecked] = useState(false)

    const signAnalogData = () => {
        const ctx = signature.current.signaturePad._ctx;
        ctx.fillStyle = "#999999"
        ctx.font = "20px sans-serif"
        const d = props.contract.templateData.date
        const slug = `${d} ${props.contract.templateData.name} ${props.contract.templateData.lastname} `
        ctx.fillText(
            `${slug} - ${slug} - ${slug} - ${slug}`,
            0,
            20
        )
    }

    const onClick = async (event) => {
        setSigning(true)
        const client = axios.create();
        axiosRetry(client, { retries: 3 });
        const pdf = await client({
            method: 'POST',
            url: props.signEndpoint,
            data: {
                signature: signature.current.toDataURL("image/png")
            },
        }).catch(err => {
            setToastData({
                title: "ERROR",
                message: "Ocurrió un error firmando el contrato"
            })
            setSigning(false)
            setToastVisible(true)
        })
        if (client) {
            router.reload()
        }
    }

    useEffect(() => {
        if (signature.current) {
            signAnalogData()
        }
    })

    if (! props.contract) {
        return(
            <IconContext.Provider value={{ color: "darkred", className: "global-class-name", size: "10em" }}>
                <Box margin={{bottom: "10px"}} align="center" justify="center" alignSelf="center">
                    <FiAlertOctagon/>
                    <Heading>No se pudo encontrar el contrato</Heading>
                </Box>
            </IconContext.Provider>
        )
    }

    if (signing) {
        return (
            <Box align="center" background="#7d4cdb" height={"medium"} align="center">
                <ReactLoading type="cylon" color="#fff" />
                <Heading>Firmando...</Heading>
            </Box>
        )
    }
 
    if (props.completed) {
        return(
            <IconContext.Provider value={{ color: "#7d4cdb", className: "global-class-name", size: "10em" }}>
                <Box margin={{bottom: "10px"}} align="center" justify="center" alignSelf="center">
                    <FiCheck/>
                    <Heading>Este contrato ya se ha firmado</Heading>
                    <Button primary label="Descargar contrato" href={props.downloadEndpoint} />
                </Box>
            </IconContext.Provider>
        )
    } else {
        const htmlContract = Handlebars.compile(props.contract.template)

        return(
            <Box margin={{bottom: "10px"}}>
                {toastVisible && (
                <Notification
                    title={toastData.title}
                    message={toastData.message}
                    onClose={() => setToastVisible(false)}
                />
                )}
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
                                backgroundColor: 'white',
                                minWidth: 40,
                                maxWidth: 60,
                                penColor: "black",
                                dotSize: 10
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
}

export async function getServerSideProps(context: BaseContext) {
    const {contract} = context.params
    const dfContracts = new DataFetcher({dbName: "esign_contracts"})
    const tenant = await dfContracts.get(contract).catch((err)=> {
        console.log(err)
    })
    if (tenant) {
        const dfTenant = new DataFetcher({dbName: `${tenant.tenant}`})
        const contractDetails = await dfTenant.get(`contract:${contract}`)

        contractDetails['templateData']['date']= moment().format('DD/MM/YYYY')
        return {
            props: {
                completed: contractDetails.completed || false,
                contract: contractDetails,
                signEndpoint: `/api/gw/complete/${contract}`,
                downloadEndpoint: `/api/gw/pdf/${contract}`
            },
        }
    } else{
        return {
            props: {
                completed: false,
                contract: false
            },
        }
    }
    
  }

function dynamic(arg0: () => Promise<any>, arg1: { ssr: boolean; }) {
    throw new Error("Function not implemented.");
}
  