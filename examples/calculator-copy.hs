-- Minimalistic calculator 

{-# LANGUAGE DeriveDataTypeable, FlexibleInstances, MultiParamTypeClasses #-}


import Haste
import Haste.HPlay.View
import Haste.HPlay.Cell
import Data.Typeable
import Prelude hiding (div,span)
import Control.Monad (when)

data Op = Op (Double -> Double -> Double) deriving Typeable

main :: IO ()
main =  do
    runBody $ div ! style "width:300px; height:400px;align:center" <<< calculator
    return()


display=  boxCell "display" :: Cell String
    
calculator= table <<<(
    (tr <<< td ! atr "colspan" "4" <<< mk display Nothing)  **>
    
    (tr <<< (button '1' **> button '2' **> button '3' **> mul))  **> 
    (tr <<< (button '4' **> button '5' **> button '6' **> divs)) **> 
    (tr <<< (button '7' **> button '8' **> button '9' **> sum))  **>
    (tr <<< (delc **> button '0' <** delLine <|>  dif <++ br)) **> 
    (tr <<< td ! atr "colspan" "4" <<< enter))
          
    where
    but :: a -> String -> Widget a
    but x l= td <<< wbutton x l -- ! style "height:20px;width:30%"
               
    mul= but (Op (*)) "*" >>= enterOp 
    divs= but (Op (/)) "/" >>= enterOp
    sum= but (Op (+)) "+" >>= enterOp
    dif= but (Op (-)) "-" >>= enterOp
    


    enter= wbutton () "Enter" ! atr "width" "100%" >> calculate
    
    button n= but n [n] >>= addNumDisplay

    enterOp op= do
        setSData True
        calculate
      **>                   -- **> forces the execution of the second setSData
                            --     even if the previous stopped
        setSData op
        
    delc= do
      but () "C"
      v <- get display
      display .= reverse . tail $ reverse v
      
    delLine= do
      but () "E"             -- if this button is pressed...
      display .= ""              -- delete the display and so on
      delSData $ Op undefined
      delSData (0 :: Double)
      delSData False
      
    calculate= do
        num'<- get display >>= return . read :: Widget Double
        num <- getSData <|> return (-1) :: Widget Double
        setSData num'
        when (num == -1) stop                 -- No previous number, do not proceed further
        Op op <-  getSData :: Widget Op
        let res= op num num'
        display .= show res
        setSData res

    addNumDisplay key= do
        clear <-  getSData <|> return False 
        case clear of
            True  -> do display .= [key] ; setSData False
            _  -> do
                v <- get display
                display .= v++ [key]
    
    toMaybe w= (w >>= return . Just) <|> return Nothing
