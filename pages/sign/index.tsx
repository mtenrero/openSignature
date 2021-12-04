// @ts-nocheck
import { Card, CardHeader, CardBody, CardFooter, Button, CheckBox, ResponsiveContext, Heading, Paragraph, Box } from "grommet"
import moment from "moment";
import React, { useEffect, useRef, useState } from "react"
import SignaturePad from "react-signature-pad-wrapper"

export default function SignDocument(props: any) {
    const size = React.useContext(ResponsiveContext);
    const signature = useRef()

    const [acceptChecked, setAcceptChecked] = useState(false)

    const signAnalogData = () => {
        console.log(signature.current);
        const ctx = signature.current.signaturePad._ctx;
        ctx.fillStyle = "#999999"
        ctx.font = "20px sans-serif"
        const d = moment().format('DD/MM/YYYY')
        const slug = `${d} NAME LAST NAME `
        ctx.fillText(
            `${slug} - ${slug} - ${slug} - ${slug}`,
            0,
            20
        )
    }

    useEffect(() => {
        if (signature.current) {
            signAnalogData()
        }
    })

    return(
        <Box margin={{bottom: "10px"}}>
            <Heading textAlign="center">Contract Name</Heading>
            <Card alignSelf="center" height={{min: "60%"}} width={{min: "60%", max: "90%"}} background="light-1">
                <CardBody pad={size} style={{textAlign: "justify"}}>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
                    labore et dolore magna aliqua.
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
                    labore et dolore magna aliqua.
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
                    labore et dolore magna aliqua.
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
                    labore et dolore magna aliqua.
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
                    labore et dolore magna aliqua.
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
                    labore et dolore magna aliqua.
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
                    labore et dolore magna aliqua.

                    <div style={{margin:"15px"}}>

                    <Heading level="3" margin="none">Signature</Heading>
                    <div style={{marginTop: "10px", marginBottom: "10px"}}>
                    Acting as <b>{"Name"}, {"Surname"}</b> with ID Number <b>{"ID Num."}</b>, phone
                    number {"999999999"} and e-mail address {"email@email.com"}:
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
                    <Button disabled={!acceptChecked} primary margin="5px" hoverIndicator label="Sign" />
                </CardFooter>
            </Card>
        </Box>
    )
}