import { Card, CardHeader, CardBody, CardFooter, Button, CheckBox, ResponsiveContext, Heading, Paragraph, Box } from "grommet"
import React, { useState } from "react"
import SignaturePad from "react-signature-pad-wrapper"


export default function SignDocument(props: any) {
    const size = React.useContext(ResponsiveContext);
    const Canvas = props => <canvas {...props}/>

    const [acceptChecked, setAcceptChecked] = useState(false)

    return(
        <Box margin={{bottom: "10px"}}>
            <Heading textAlign="center">Contract Name</Heading>
            <Card alignSelf="center" height={{min: "80%"}} width={{min: "60%", max: "90%"}} background="light-1">
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
                        <SignaturePad redrawOnResize canvasProps={{
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